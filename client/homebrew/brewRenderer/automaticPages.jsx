import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import safeHTML from './safeHTML.js';
import { paginateAutomatically } from './automaticPagination.js';
import pagedScriptUrl from '../../../node_modules/pagedjs/dist/paged.js?url';
import coreStyles from '@sharedStyles/core.less?inline';

const OUTPUT_CSS = `
.automaticPages { display: contents !important; }
.automaticPages > .pagedjs_page.page { padding: 0 !important; columns: auto !important; contain: none !important; content-visibility: visible !important; overflow: hidden; margin: 0 auto 30px; box-shadow: 1px 4px 14px #000; }
.automaticPages .hb-auto-source { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; columns: auto !important; contain: none !important; content-visibility: visible !important; overflow: visible !important; background: none !important; box-shadow: none !important; }
.automaticPages .hb-auto-source::before, .automaticPages .hb-auto-source::after { display: none !important; }
.automaticPages .hb-auto-source > .columnWrapper { display: contents; }
.automaticPages .hb-auto-source .block { display: block !important; }
.automaticPages .pagedjs_page_content { height: 100%; }
.facing.recto .automaticPages > .page:first-child { grid-column-start: 2; }
.facing .automaticPages > .page, .flow .automaticPages > .page { margin-left: 0; margin-right: 0; }
@media print { .automaticPages > .pagedjs_page.page { margin: 0 !important; box-shadow: none !important; break-after: page; } .automaticPages > .pagedjs_page:last-child { break-after: auto; } }
`;

const AutomaticPages = ({ pages, css, onPageCount, onVisibilityChange, onStatus })=>{
	const host = useRef(null);
	const pending = useRef(Promise.resolve());
	const failure = useRef(null);
	const [output, setOutput] = useState({ pages: '', styles: '' });
	const html = renderToStaticMarkup(<>{pages}</>);
	const reportCount = useEffectEvent(onPageCount);
	const reportVisibility = useEffectEvent(onVisibilityChange);
	const reportStatus = useEffectEvent(onStatus);

	useEffect(()=>{
		const target = host.current;
		if(!target) return;
		const doc = target.ownerDocument;
		let controller;
		let timer;
		let disposed = false;
		let finish;
		const schedule = ()=>{
			clearTimeout(timer);
			controller?.abort();
			finish?.();
			pending.current = new Promise((resolve)=>{ finish = resolve; });
			failure.current = null;
			reportStatus('Paginating...');
			timer = setTimeout(async ()=>{
				controller = new AbortController();
				const signal = controller.signal;
				const complete = finish;
				try {
					const template = doc.createElement('template');
					template.innerHTML = safeHTML(html);
					const sources = [...template.content.querySelectorAll('.page')];
					const probe = sources[0]?.cloneNode(false);
					if(!probe) return;
					probe.removeAttribute('id');
					probe.style.visibility = 'hidden';
					probe.style.position = 'absolute';
					target.parentElement.appendChild(probe);
					const style = doc.defaultView.getComputedStyle(probe);
					const geometry = {
						width   : parseFloat(style.width),
						height  : parseFloat(style.height),
						padding : `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
						columns : style.columnCount === 'auto' ? '2' : style.columnCount,
						gap     : style.columnGap === 'normal' ? '0.9cm' : style.columnGap
					};
					probe.remove();
					sources.forEach((source, index)=>{
						source.classList.add('hb-auto-source');
						source.dataset.sourcePage = String(index + 1);
						source.removeAttribute('id');
					});
					const holder = doc.createElement('div');
					holder.appendChild(template.content);
					const result = await paginateAutomatically({ html: holder.innerHTML, css, baseStyles: coreStyles, geometry, baseUrl: doc.baseURI, engineUrl: pagedScriptUrl, signal });
					if(disposed || signal.aborted) return;
					holder.innerHTML = safeHTML(result.pages.join(''));
					holder.querySelectorAll('.hb-auto-source').forEach((source)=>source.classList.remove('page'));
					[...holder.children].forEach((page, index)=>{
						const source = page.querySelector('.hb-auto-source');
						page.classList.add('page');
						if(source) {
							page.classList.add(...[...source.classList].filter((name)=>!['page', 'hb-auto-source'].includes(name)));
							page.dataset.sourcePage = source.dataset.sourcePage;
						}
						page.id = `p${index + 1}`;
						page.style.setProperty('--pagedjs-counter-page', String(index + 1));
						page.style.setProperty('--pagedjs-counter-page-numbers', String(index + 1));
					});
					setOutput({ pages: holder.innerHTML, styles: result.styles });
					reportCount(result.pages.length);
					reportStatus('');
				} catch (error) {
					if(!disposed && error.name !== 'AbortError') {
						failure.current = error;
						reportStatus(`Pagination failed: ${error.message}`);
					}
				} finally {
					complete();
				}
			}, 250);
		};
		const onStylesLoaded = (event)=>{
			if(event.target.closest?.('.homebrewThemeStyles')) schedule();
		};
		const preparePrint = (event)=>event.detail?.waitUntil((async ()=>{
			let job;
			do {
				job = pending.current;
				await job;
			} while (job !== pending.current);
			if(failure.current) throw failure.current;
		})());
		schedule();
		doc.fonts.addEventListener('loadingdone', schedule);
		doc.addEventListener('load', onStylesLoaded, true);
		document.addEventListener('print:startprep', preparePrint);
		return ()=>{
			disposed = true;
			clearTimeout(timer);
			controller?.abort();
			finish?.();
			doc.fonts.removeEventListener('loadingdone', schedule);
			doc.removeEventListener('load', onStylesLoaded, true);
			document.removeEventListener('print:startprep', preparePrint);
		};
	}, [html, css]);

	useEffect(()=>{
		const target = host.current;
		if(!target || !output.pages) return;
		const observer = new IntersectionObserver((entries)=>{
			entries.forEach((entry)=>reportVisibility(Number(entry.target.id.slice(1)), entry.isIntersecting, false));
			const visible = entries.filter((entry)=>entry.isIntersecting).sort((left, right)=>right.intersectionRatio - left.intersectionRatio);
			if(visible.length) reportVisibility(Number(visible[0].target.id.slice(1)), true, true, Number(visible[0].target.dataset.sourcePage));
		}, { threshold: [0, .3, .6] });
		[...target.children].forEach((page)=>observer.observe(page));
		return ()=>observer.disconnect();
	}, [output.pages]);

	return <>
		<style>{output.styles}{OUTPUT_CSS}</style>
		<div className='automaticPages' ref={host} dangerouslySetInnerHTML={{ __html: output.pages }} />
	</>;
};

export default AutomaticPages;