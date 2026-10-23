import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { DEFAULT_BREW } from './brewDefaults.js';
import { splitTextStyleAndMetadata } from '../shared/helpers.js';
import Themes from '../themes/themes.json' with { type: 'json' };

const fail = (status, message)=>Object.assign(new Error(message), { status });
const revision = (text)=>createHash('sha256').update(text).digest('hex');
const fileId = (name)=>Buffer.from(name).toString('base64url');

export function createFileStorage(directory, serialize) {
	fs.mkdirSync(directory, { recursive: true });
	const root = fs.realpathSync(directory);
	const locks = new Set();

	const resolve = (name)=>{
		if(typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0') || name.includes(':') || path.posix.isAbsolute(name) || name.split('/').some((part)=>!part || part === '.' || part === '..'))
			throw fail(400, 'Invalid file path.');
		const target = path.resolve(root, name);
		if(!target.startsWith(root + path.sep)) throw fail(403, 'File is outside the Markdown folder.');
		let current = root;
		for (const part of name.split('/')) {
			current = path.join(current, part);
			if(fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw fail(403, 'Symbolic links are not supported.');
		}
		return target;
	};

	const decode = (id)=>{
		const name = Buffer.from(id, 'base64url').toString('utf8');
		if(fileId(name) !== id || !/\.md$/i.test(name)) throw fail(400, 'Invalid Markdown file ID.');
		resolve(name);
		return name;
	};

	const read = (id)=>{
		const name = decode(id);
		const target = resolve(name);
		if(!fs.existsSync(target) || !fs.statSync(target).isFile()) throw fail(404, 'Markdown file not found.');
		const source = fs.readFileSync(target, 'utf8');
		const stats = fs.statSync(target);
		const brew = { ...structuredClone(DEFAULT_BREW), title: path.basename(name, path.extname(name)), text: source };
		splitTextStyleAndMetadata(brew);
		return { ...brew, filePath: name, editId: id, shareId: id, version: revision(source), createdAt: stats.birthtime, updatedAt: stats.mtime };
	};

	const list = (folder = '')=>{
		const entries = fs.readdirSync(folder ? resolve(folder) : root, { withFileTypes: true });
		return entries.flatMap((entry)=>{
			const name = folder ? `${folder}/${entry.name}` : entry.name;
			if(entry.isSymbolicLink() || entry.name.startsWith('.')) return [];
			if(entry.isDirectory()) return list(name);
			if(!entry.isFile() || !/\.md$/i.test(entry.name)) return [];
			return [{ filePath: name, editId: fileId(name), title: path.basename(entry.name, path.extname(entry.name)) }];
		}).sort((left, right)=>left.filePath.localeCompare(right.filePath));
	};

	const save = (name, brew, create = false)=>{
		if(!/\.md$/i.test(name)) throw fail(400, 'Only .md files can be saved.');
		const target = resolve(name);
		if(typeof brew.text !== 'string') throw fail(400, 'Markdown text is required.');
		if(locks.has(target)) throw fail(409, 'A save is already in progress.');
		locks.add(target);
		let temporary;
		try {
			const exists = fs.existsSync(target);
			if(create && exists) throw fail(409, 'A file with this name already exists.');
			if(!create && !exists) throw fail(404, 'Markdown file not found.');
			if(!create && revision(fs.readFileSync(target, 'utf8')) !== brew.version) throw fail(409, 'This file changed on disk. Reload before saving to avoid overwriting those changes.');
			fs.mkdirSync(path.dirname(target), { recursive: true });
			temporary = path.join(path.dirname(target), `.${randomUUID()}.tmp`);
			fs.writeFileSync(temporary, serialize({ ...structuredClone(DEFAULT_BREW), ...brew }), { encoding: 'utf8', flag: 'wx' });
			if(create) {
				fs.linkSync(temporary, target);
				fs.unlinkSync(temporary);
			} else {
				fs.renameSync(temporary, target);
			}
			return read(fileId(name));
		} finally {
			if(temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
			locks.delete(target);
		}
	};

	return { root, resolve, decode, read, list, save };
}

export function fileStorageRoutes(store, { themeHandler, defaultMetaTags }) {
	const router = express.Router();
	router.use((req, res, next)=>{
		if(!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
			const origin = req.get('origin');
			if((origin && origin !== `${req.protocol}://${req.get('host')}`) || req.get('sec-fetch-site') === 'cross-site')
				return res.status(403).json({ message: 'Cross-origin writes are not allowed.' });
		}
		next();
	});
	router.get('/api/files', (req, res)=>res.json(store.list()));
	router.post('/api', (req, res)=>{
		if(typeof req.body.filePath !== 'string') throw fail(400, 'Choose a Markdown file path.');
		res.status(201).json(store.save(req.body.filePath, req.body, true));
	});
	router.put('/api/update/:id', (req, res)=>res.json(store.save(store.decode(req.params.id), req.body)));
	router.get('/api/theme/:renderer/:id', (req, res, next)=>{
		let theme = req.params.id;
		const renderer = req.params.renderer === 'legacy' ? 'Legacy' : req.params.renderer;
		const seen = new Set();
		while (theme) {
			if(!Object.hasOwn(Themes[renderer] || {}, theme) || seen.has(theme)) throw fail(404, 'Only built-in themes are available in file mode.');
			seen.add(theme);
			theme = Themes[renderer][theme].baseTheme;
		}
		Promise.resolve(themeHandler(req, res)).catch(next);
	});
	router.get('/api/fetch/:id', (req, res)=>{
		res.set('Cache-Control', 'no-store');
		res.json({ brew: store.read(req.params.id) });
	});
	router.get('/download/:id', (req, res)=>{
		const name = store.decode(req.params.id);
		res.download(store.resolve(name));
	});
	router.get('/files/content/{*name}', (req, res, next)=>{
		const name = req.params.name.join('/');
		const target = store.resolve(name);
		if(!/\.(png|jpe?g|gif|webp|avif|svg|woff2?|ttf|otf)$/i.test(name)) return res.sendStatus(404);
		res.set('Cache-Control', 'no-store');
		res.sendFile(target, (error)=>{ if(error) next(error); });
	});
	router.get(['/', '/files'], (req, res, next)=>{
		req.brews = store.list();
		req.customUrl = '/files';
		req.ogMeta = { ...defaultMetaTags, title: 'Markdown Files' };
		next();
	});
	router.get('/new', (req, res)=>res.redirect('/files?new=1'));
	router.get(['/edit/:id', '/share/:id'], (req, res, next)=>{
		req.brew = store.read(req.params.id);
		req.userThemes = [];
		const folder = path.posix.dirname(req.brew.filePath);
		req.assetBase = `/files/content/${folder === '.' ? '' : `${folder.split('/').map(encodeURIComponent).join('/')}/`}`;
		req.ogMeta = { ...defaultMetaTags, title: req.brew.title };
		res.set('Cache-Control', 'no-store');
		next();
	});
	router.use('/api', (req, res)=>res.status(404).json({ message: 'This operation is unavailable in file mode.' }));
	return router;
}