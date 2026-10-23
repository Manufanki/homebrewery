import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { createFileStorage, fileStorageRoutes } from './file-storage.js';
import createApp from './app.js';
import config from './config.js';

describe('Markdown file storage', ()=>{
	let directory;
	let store;
	let app;
	beforeEach(()=>{
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-files-'));
		store = createFileStorage(directory, (brew)=>brew.text);
		app = express();
		app.use(express.json());
		app.use(fileStorageRoutes(store, { themeHandler: (req, res)=>res.json({}), defaultMetaTags: {} }));
		app.use((error, req, res, next)=>res.status(error.status || 500).json({ message: error.message }));
	});
	afterEach(()=>fs.rmSync(directory, { recursive: true, force: true }));

	it('lists nested Markdown files and reads UTF-8 content', ()=>{
		fs.mkdirSync(path.join(directory, 'chapter'));
		fs.writeFileSync(path.join(directory, 'chapter', 'example.md'), '# Example\n');
		fs.writeFileSync(path.join(directory, 'image.png'), 'image');
		const files = store.list();
		expect(files).toHaveLength(1);
		expect(files[0].filePath).toBe('chapter/example.md');
		expect(store.read(files[0].editId).text).toBe('# Example\n');
	});

	it('creates and updates files without losing Markdown asset links', async ()=>{
		const text = '![image](assets/example.png)\n';
		const created = await request(app).post('/api').send({ filePath: 'new.md', text }).expect(201);
		await request(app).put(`/api/update/${created.body.editId}`).send({ ...created.body, text: `${text}Edited\n` }).expect(200);
		expect(fs.readFileSync(path.join(directory, 'new.md'), 'utf8')).toBe(`${text}Edited\n`);
		expect(fs.readdirSync(directory)).toEqual(['new.md']);
	});

	it('refuses duplicate creation and external-edit conflicts', ()=>{
		const brew = store.save('test.md', { text: 'original' }, true);
		expect(()=>store.save('test.md', { text: 'overwrite' }, true)).toThrow('already exists');
		fs.writeFileSync(path.join(directory, 'test.md'), 'external edit');
		expect(()=>store.save('test.md', { ...brew, text: 'stale edit' })).toThrow('changed on disk');
		expect(fs.readFileSync(path.join(directory, 'test.md'), 'utf8')).toBe('external edit');
	});

	it('fetches external disk edits with a fresh revision and no caching', async ()=>{
		const brew = store.save('sync.md', { text: 'original' }, true);
		await request(app).get(`/api/fetch/${brew.editId}`).expect(200).expect('Cache-Control', 'no-store');
		fs.writeFileSync(path.join(directory, 'sync.md'), '# Changed outside Homebrewery\n');
		const response = await request(app).get(`/api/fetch/${brew.editId}`).expect(200).expect('Cache-Control', 'no-store');
		expect(response.body.brew.text).toBe('# Changed outside Homebrewery\n');
		expect(response.body.brew.version).not.toBe(brew.version);
		expect(fs.readFileSync(path.join(directory, 'sync.md'), 'utf8')).toBe('# Changed outside Homebrewery\n');
	});

	it.each(['../escape.md', '/escape.md', 'C:/escape.md', 'nested/../../escape.md', 'nested\\escape.md'])('rejects unsafe path %s', (name)=>{
		expect(()=>store.save(name, { text: 'bad' }, true)).toThrow();
	});

	it('rejects non-Markdown writes and invalid IDs', ()=>{
		expect(()=>store.save('script.js', { text: 'bad' }, true)).toThrow('Only .md');
		expect(()=>store.read('invalid')).toThrow();
	});

	it('does not traverse directory symlinks', ()=>{
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-outside-'));
		try {
			fs.writeFileSync(path.join(outside, 'private.md'), 'private');
			fs.symlinkSync(outside, path.join(directory, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
			expect(store.list()).toEqual([]);
			expect(()=>store.resolve('linked/private.md')).toThrow('Symbolic links');
			expect(()=>store.save('linked/new.md', { text: 'bad' }, true)).toThrow('Symbolic links');
		} finally {
			fs.rmSync(path.join(directory, 'linked'), { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it('serves assets but does not expose arbitrary files', async ()=>{
		fs.mkdirSync(path.join(directory, 'assets'));
		fs.writeFileSync(path.join(directory, 'assets', 'example.png'), 'image');
		fs.writeFileSync(path.join(directory, 'secret.json'), '{}');
		await request(app).get('/files/content/assets/example.png').expect(200);
		await request(app).get('/files/content/secret.json').expect(404);
	});

	it('rejects cross-origin writes', async ()=>{
		await request(app).post('/api').set('Origin', 'https://example.com').send({ filePath: 'test.md', text: '' }).expect(403);
		expect(store.list()).toEqual([]);
	});

	it('runs the application without a database and round-trips metadata, CSS, and source', async ()=>{
		const getConfig = config.get.bind(config);
		const settings = { storage_mode: 'files', node_env: 'local', hb_files: directory };
		const configMock = jest.spyOn(config, 'get').mockImplementation((key)=>Object.hasOwn(settings, key) ? settings[key] : getConfig(key));
		try {
			const fileApp = await createApp();
			await request(fileApp).get('/api/files').set('Host', 'attacker.example').expect(403);
			await request(fileApp).get('/api/files').set('Origin', 'https://attacker.example').expect(403);
			await request(fileApp).get('/').expect(200).expect(/Markdown Files/);
			const created = await request(fileApp).post('/api').send({
				filePath : 'nested/example.md', text     : '# Example\n![Image](assets/picture.png)',
				title    : 'Example', renderer : 'V3', theme    : '5ePHB', lang     : 'de', tags     : ['test'], style    : '.page { color: red; }'
			}).expect(201);
			expect(created.body.lang).toBe('de');
			expect(created.body.tags).toEqual(['test']);
			expect(created.body.trimSize).toEqual({ width: '8.5in', height: '11in' });
			expect(created.body.style).toContain('color: red');
			expect(created.body.text).toBe('# Example\n![Image](assets/picture.png)');
			await request(fileApp).get(`/edit/${created.body.editId}`).expect(200).expect(/\/files\/content\/nested\//);
			await request(fileApp).get('/api/theme/V3/5ePHB').expect(200);
			await request(fileApp).get('/api/theme/V3/nonexistent').expect(404);
			await request(fileApp).get('/api/remove/anything').expect(404);
			const updated = await request(fileApp).put(`/api/update/${created.body.editId}`).send({ ...created.body, text: '# Changed' }).expect(200);
			expect(updated.body.text).toBe('# Changed');
			await request(fileApp).get(`/download/${created.body.editId}`).expect(200).expect(/# Changed/);
		} finally {
			configMock.mockRestore();
		}
	});
});