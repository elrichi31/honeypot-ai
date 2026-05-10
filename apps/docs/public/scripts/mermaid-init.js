import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

function createMermaidTheme() {
	return {
		startOnLoad: false,
		securityLevel: 'loose',
		theme: 'base',
		flowchart: {
			useMaxWidth: true,
			htmlLabels: true,
			curve: 'basis',
		},
		sequence: {
			useMaxWidth: true,
		},
		themeVariables: {
			background: 'transparent',
			fontFamily: 'ui-sans-serif, system-ui, sans-serif',
			fontSize: '15px',
			textColor: '#e5eefb',
			nodeTextColor: '#f8fafc',
			lineColor: '#8ea4c0',
			defaultLinkColor: '#8ea4c0',
			primaryColor: 'rgba(15, 23, 42, 0.42)',
			primaryTextColor: '#f8fafc',
			primaryBorderColor: '#38bdf8',
			secondaryColor: 'rgba(23, 32, 51, 0.34)',
			secondaryTextColor: '#e5eefb',
			secondaryBorderColor: '#7dd3fc',
			tertiaryColor: 'rgba(15, 23, 42, 0.22)',
			tertiaryTextColor: '#dbe7f5',
			tertiaryBorderColor: '#475569',
			mainBkg: 'rgba(15, 23, 42, 0.42)',
			secondBkg: 'rgba(23, 32, 51, 0.34)',
			tertiaryBkg: 'rgba(15, 23, 42, 0.22)',
			clusterBkg: 'rgba(15, 23, 42, 0.12)',
			clusterBorder: 'rgba(71, 85, 105, 0.55)',
			edgeLabelBackground: 'rgba(11, 18, 32, 0.78)',
			labelBoxBkgColor: 'rgba(11, 18, 32, 0.78)',
			labelBoxBorderColor: '#334155',
			noteBkgColor: 'rgba(30, 41, 59, 0.75)',
			noteTextColor: '#e2e8f0',
			noteBorderColor: '#475569',
			actorBkg: 'rgba(15, 23, 42, 0.42)',
			actorBorder: '#38bdf8',
			actorTextColor: '#f8fafc',
			actorLineColor: '#8ea4c0',
			signalColor: '#93c5fd',
			signalTextColor: '#e5eefb',
			loopTextColor: '#cbd5e1',
			sectionBkgColor: 'rgba(15, 23, 42, 0.22)',
			sectionBkgColor2: 'rgba(23, 32, 51, 0.34)',
			sectionBorderColor: 'rgba(71, 85, 105, 0.55)',
			sectionTextColor: '#e5eefb',
			activationBorderColor: '#38bdf8',
			activationBkgColor: 'rgba(23, 32, 51, 0.4)',
			pie1: '#38bdf8',
			pie2: '#22c55e',
			pie3: '#f59e0b',
			pie4: '#fb7185',
			pie5: '#a78bfa',
			pie6: '#94a3b8',
			pie7: '#2dd4bf',
			pie8: '#f97316',
		},
	};
}

function extractMermaidSource(codeBlock) {
	const lineNodes = Array.from(codeBlock.querySelectorAll('.ec-line .code'));
	if (lineNodes.length > 0) {
		return lineNodes.map((lineNode) => lineNode.textContent ?? '').join('\n').trim();
	}

	return codeBlock.textContent?.trim() ?? '';
}

function prepareMermaidBlocks() {
	const candidates = [
		...document.querySelectorAll('pre code.language-mermaid'),
		...document.querySelectorAll('pre[data-language="mermaid"] code'),
	];

	candidates.forEach((codeBlock) => {
		const pre = codeBlock.closest('pre');
		if (!pre || pre.dataset.mermaidPrepared === 'true') return;

		const container = document.createElement('div');
		container.className = 'mermaid';
		container.textContent = extractMermaidSource(codeBlock);

		const wrapper = pre.closest('figure') ?? pre;
		pre.dataset.mermaidPrepared = 'true';
		wrapper.replaceWith(container);
	});
}

async function renderMermaidDiagrams() {
	prepareMermaidBlocks();

	const nodes = Array.from(document.querySelectorAll('.mermaid:not([data-processed])'));
	if (nodes.length === 0) return;

	try {
		mermaid.initialize(createMermaidTheme());
		await mermaid.run({ nodes });
	} catch (error) {
		console.warn('[docs] Mermaid render failed', error);
	}
}

document.addEventListener('DOMContentLoaded', renderMermaidDiagrams);
document.addEventListener('astro:page-load', renderMermaidDiagrams);
