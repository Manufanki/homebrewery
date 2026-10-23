function paginationWorker() {
	window.addEventListener('message', async (event)=>{
		if(event.source !== parent || event.data?.type !== 'paginate') return;
		const { html, css, geometry, token } = event.data;
		try {
			const source = document.createElement('div');
			source.innerHTML = html;
			source.querySelectorAll('script, iframe, object, embed, meta, base, link, form').forEach((element)=>element.remove());
			source.querySelectorAll('img').forEach((image)=>image.loading = 'eager');
			const previewer = new window.Paged.Previewer();
			previewer.chunker.q.tick = (callback)=>setTimeout(callback, 0);
			const initializeHandlers = previewer.initializeHandlers.bind(previewer);
			previewer.initializeHandlers = ()=>{
				const handlers = initializeHandlers();
				const hook = previewer.polisher.hooks.onRule;
				const nativeSelector = (node)=>{
					if(!node) return false;
					if(node.type === 'PseudoClassSelector' && ['is', 'where', 'not', 'has'].includes(node.name)) return true;
					let found = false;
					node.children?.forEach((child)=>{ found ||= nativeSelector(child); });
					return found;
				};
				hook.hooks = hook.hooks.map((handler)=>(rule, item, list)=>{
					if(nativeSelector(rule.prelude)) return;
					if(item && list && item !== list.head && item.prev === null && item.next === null) return;
					return handler(rule, item, list);
				});
				return handlers;
			};
			const layoutCSS = `
				@page { size: ${geometry.width}px ${geometry.height}px; margin: ${geometry.padding}; }
				.hb-auto-source.page { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; columns: auto !important; contain: none !important; content-visibility: visible !important; overflow: visible !important; background: none !important; box-shadow: none !important; }
				.hb-auto-source + .hb-auto-source { break-before: page; }
				.hb-auto-source > .columnWrapper { display: contents; }
				.pagedjs_page_content { columns: ${geometry.columns} !important; column-gap: ${geometry.gap} !important; column-fill: auto; }
				.page img { max-width: 100%; max-height: calc(${geometry.height}px - ${geometry.padding.split(' ')[0]} - ${geometry.padding.split(' ')[2]}); height: auto; object-fit: contain; }
				.page .block { display: block; }
				.page .columnSplit { margin: 0 !important; height: 0 !important; break-after: column; }
				.page h1, .page h2, .page h3, .page h4 { break-after: avoid; }
				.page .monster, .page blockquote, .page table, .page img { break-inside: avoid; }
			`;
			previewer.hooks.beforePreview.register(()=>{
				previewer.chunker.hooks.onPageLayout.register((wrapper, token, layout)=>{ layout.gap = 0; });
				previewer.chunker.hooks.beforeParsed.register(async ()=>{
					await document.fonts.ready;
				});
			});
			const flow = await previewer.preview(source.innerHTML, [{ [document.baseURI]: `${css}\n${layoutCSS}` }], document.body);
			const styles = [...document.querySelectorAll('style')].map((style)=>style.textContent).join('\n');
			const pages = flow.pages.map((page)=>page.element.outerHTML);
			parent.postMessage({ type: 'paginated', token, pages, styles }, event.origin);
		} catch (error) {
			parent.postMessage({ type: 'pagination-error', token, message: error.message, stack: error.stack }, event.origin);
		}
	});
	parent.postMessage({ type: 'pagination-ready' }, '*');
}

export function paginateAutomatically({ html, css, baseStyles = '', geometry, baseUrl, engineUrl, signal }) {
	return new Promise((resolve, reject)=>{
		if(!engineUrl) return reject(new Error('The pagination engine URL is required.'));
		const frame = document.createElement('iframe');
		const token = crypto.randomUUID();
		const nonce = crypto.randomUUID();
		frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
		frame.setAttribute('aria-hidden', 'true');
		frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1200px;height:1200px;visibility:hidden;pointer-events:none;';
		const cleanup = ()=>{
			clearTimeout(timeout);
			window.removeEventListener('message', onMessage);
			signal?.removeEventListener('abort', abort);
			frame.remove();
		};
		const abort = ()=>{
			cleanup();
			reject(new DOMException('Pagination cancelled', 'AbortError'));
		};
		const onMessage = (event)=>{
			if(event.source !== frame.contentWindow || event.origin !== location.origin) return;
			if(event.data?.type === 'pagination-ready') {
				frame.contentWindow.postMessage({ type: 'paginate', html, css: `${baseStyles}\n${css}`, geometry, token }, location.origin);
			} else if(event.data?.token === token) {
				cleanup();
				if(event.data.type === 'pagination-error') reject(Object.assign(new Error(event.data.message), { stack: event.data.stack }));
				else resolve(event.data);
			}
		};
		const timeout = setTimeout(()=>{
			cleanup();
			reject(new Error('Automatic pagination timed out.'));
		}, 60000);
		window.addEventListener('message', onMessage);
		signal?.addEventListener('abort', abort, { once: true });
		if(signal?.aborted) return abort();
		const escapeAttribute = (value)=>value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
		frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'; object-src 'none'; frame-src 'none'; form-action 'none';"><base href="${escapeAttribute(baseUrl)}"><script nonce="${nonce}" src="${escapeAttribute(new URL(engineUrl, location.href).href)}"></script></head><body><script nonce="${nonce}">(${paginationWorker.toString()})()</script></body></html>`;
		document.body.appendChild(frame);
	});
}