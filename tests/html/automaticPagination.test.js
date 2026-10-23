import globalJsdom from 'jsdom-global';
import { paginateAutomatically } from '../../client/homebrew/brewRenderer/automaticPagination.js';

describe('automatic pagination worker', ()=>{
	let cleanupDOM;
	const settings = {
		html      : '<article class="page"><p>Unchanged Markdown content</p></article>',
		css       : '.page { font-size: 14px; }',
		geometry  : { width: 816, height: 1056, padding: '53px 72px 64px 72px', columns: '2', gap: '34px' },
		baseUrl   : 'http://localhost:8000/files/content/',
		engineUrl : '/paged.js'
	};
	beforeEach(()=>{
		cleanupDOM = globalJsdom('', { url: 'http://localhost:8000/' });
	});
	afterEach(()=>{
		jest.useRealTimers();
		cleanupDOM();
	});
	const send = (frame, data, source = frame.contentWindow)=>window.dispatchEvent(new window.MessageEvent('message', {
		origin : location.origin, source, data
	}));

	it('passes immutable source to the worker and accepts only its matching result', async ()=>{
		const original = { ...settings };
		const promise = paginateAutomatically(settings);
		const frame = document.querySelector('iframe');
		expect(frame.getAttribute('aria-hidden')).toBe('true');
		expect(frame.srcdoc).toContain('script-src \'nonce-');
		expect(frame.srcdoc).not.toContain(settings.html);
		frame.contentWindow.postMessage = jest.fn();
		send(frame, { type: 'pagination-ready' });
		const message = frame.contentWindow.postMessage.mock.calls[0][0];
		expect(message.html).toBe(settings.html);
		send(frame, { type: 'paginated', token: 'wrong-token', pages: ['wrong'] });
		expect(document.querySelector('iframe')).toBe(frame);
		send(frame, { type: 'paginated', token: message.token, pages: ['wrong'] }, window);
		expect(document.querySelector('iframe')).toBe(frame);
		send(frame, { type: 'paginated', token: message.token, pages: ['page one', 'page two'], styles: '.page {}' });
		expect((await promise).pages).toEqual(['page one', 'page two']);
		expect(document.querySelector('iframe')).toBeNull();
		expect(settings).toEqual(original);
	});

	it('measures with the shared preview reset before theme and user styles', async ()=>{
		const baseStyles = ':where(body) { line-height: 1; } * { box-sizing: border-box; }';
		const promise = paginateAutomatically({ ...settings, baseStyles });
		const frame = document.querySelector('iframe');
		frame.contentWindow.postMessage = jest.fn();
		send(frame, { type: 'pagination-ready' });
		const message = frame.contentWindow.postMessage.mock.calls[0][0];
		expect(message.css).toBe(`${baseStyles}\n${settings.css}`);
		expect(message.html).toBe(settings.html);
		send(frame, { type: 'paginated', token: message.token, pages: ['complete stat block'], styles: message.css });
		expect((await promise).pages).toEqual(['complete stat block']);
	});

	it('cancels stale layouts and removes their iframe', async ()=>{
		const controller = new AbortController();
		const promise = paginateAutomatically({ ...settings, signal: controller.signal });
		controller.abort();
		await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
		expect(document.querySelector('iframe')).toBeNull();
	});

	it('propagates layout errors and cleans up', async ()=>{
		const promise = paginateAutomatically(settings);
		const frame = document.querySelector('iframe');
		frame.contentWindow.postMessage = jest.fn();
		send(frame, { type: 'pagination-ready' });
		const { token } = frame.contentWindow.postMessage.mock.calls[0][0];
		send(frame, { type: 'pagination-error', token, message: 'Invalid layout' });
		await expect(promise).rejects.toThrow('Invalid layout');
		expect(document.querySelector('iframe')).toBeNull();
	});

	it('times out instead of keeping a stalled layout alive', async ()=>{
		jest.useFakeTimers();
		const promise = paginateAutomatically(settings);
		jest.advanceTimersByTime(60000);
		await expect(promise).rejects.toThrow('timed out');
		expect(document.querySelector('iframe')).toBeNull();
	});
});