import React, { useState } from 'react';
import Navbar from '@navbar/navbar.jsx';
import Nav from '@navbar/nav.jsx';
import request from '../../utils/request-middleware.js';
import './filesPage.less';

const FilesPage = ({ brews = [] })=>{
	const [files, setFiles] = useState(brews);
	const [query, setQuery] = useState('');
	const [filePath, setFilePath] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [creating, setCreating] = useState(new URLSearchParams(window.location.search).has('new'));
	const showError = (err)=>setError(err.response?.body?.message || err.message);

	const refresh = async ()=>{
		setBusy(true);
		setError('');
		try {
			const response = await request.get('/api/files');
			setFiles(response.body);
		} catch (err) {
			showError(err);
		} finally {
			setBusy(false);
		}
	};

	const create = async (event)=>{
		event.preventDefault();
		setBusy(true);
		setError('');
		try {
			const name = filePath.trim();
			const title = name.split('/').pop().replace(/\.md$/i, '');
			const response = await request.post('/api').send({
				filePath : name, title, text : `# ${title}\n`, renderer : 'V3', theme : '5ePHB', lang : 'en'
			});
			window.location.assign(`/edit/${response.body.editId}`);
		} catch (err) {
			showError(err);
			setBusy(false);
		}
	};

	const visible = files.filter((file)=>file.filePath.toLowerCase().includes(query.toLowerCase()));
	return <div className='filesPage sitePage'>
		<Navbar><Nav.section><Nav.item icon='fas fa-plus' onClick={()=>setCreating(true)}>new file</Nav.item></Nav.section></Navbar>
		<main>
			<div className='fileHeading'><h1>Markdown Files</h1><span>{files.length} files</span></div>
			<div className='fileToolbar'>
				<input aria-label='Search files' type='search' placeholder='Search files' value={query} onChange={(event)=>setQuery(event.target.value)} />
				<button type='button' title='Refresh files' aria-label='Refresh files' disabled={busy} onClick={refresh}><i className={`fas fa-sync${busy ? ' fa-spin' : ''}`} /></button>
			</div>
			{creating && <form onSubmit={create}>
				<label htmlFor='new-file-path'>File path</label>
				<input id='new-file-path' placeholder='chapter/example.md' required pattern='.*\.[mM][dD]' value={filePath} onChange={(event)=>setFilePath(event.target.value)} />
				<button disabled={busy} type='submit'><i className='fas fa-plus' /> Create</button>
				<button type='button' title='Cancel' aria-label='Cancel' onClick={()=>setCreating(false)}><i className='fas fa-times' /></button>
			</form>}
			{error && <p className='fileError' role='alert'>{error}</p>}
			<table>
				<thead><tr><th scope='col'>File</th><th scope='col'>Actions</th></tr></thead>
				<tbody>{visible.map((file)=><tr key={file.editId}>
					<td><a href={`/edit/${file.editId}`}><i className='far fa-file-alt' /> {file.filePath}</a></td>
					<td className='fileActions'>
						<a href={`/share/${file.editId}`} title='Preview' aria-label={`Preview ${file.filePath}`}><i className='fas fa-eye' /></a>
						<a href={`/download/${file.editId}`} title='Download Markdown' aria-label={`Download ${file.filePath}`}><i className='fas fa-download' /></a>
					</td>
				</tr>)}</tbody>
			</table>
			{!visible.length && <p>No Markdown files found.</p>}
		</main>
	</div>;
};

export default FilesPage;