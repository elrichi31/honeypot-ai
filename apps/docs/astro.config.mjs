// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Honeypot Platform',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/elrichi31/honeypot-ai' }],
			head: [
				{
					tag: 'script',
					attrs: { type: 'module' },
					content: `
						import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
						mermaid.initialize({ startOnLoad: false, theme: 'dark' });
						document.addEventListener('DOMContentLoaded', () => {
							document.querySelectorAll('pre code.language-mermaid').forEach((el) => {
								const pre = el.parentElement;
								const wrapper = pre.parentElement;
								const div = document.createElement('div');
								div.className = 'mermaid';
								div.textContent = el.textContent;
								wrapper.replaceChild(div, pre);
							});
							mermaid.run();
						});
					`,
				},
			],
			sidebar: [
				{ label: 'Introduction', slug: 'intro' },
				{ label: 'Architecture', slug: 'architecture' },
				{
					label: 'Getting Started',
					items: [
						{ label: 'Local Development', slug: 'getting-started/local-dev' },
						{ label: 'Environment Variables', slug: 'getting-started/env-vars' },
					],
				},
				{
					label: 'Deployment',
					items: [
						{ label: 'Single-Host (one VPS)', slug: 'deployment/single-host' },
						{ label: 'Two-Host (recommended)', slug: 'deployment/two-host' },
						{ label: 'Multi-VM Local Lab', slug: 'deployment/multi-vm-local' },
					],
				},
				{
					label: 'Sensors',
					items: [
						{ label: 'SSH Honeypot (Cowrie)', slug: 'services/cowrie' },
						{ label: 'Web Honeypot', slug: 'services/web-honeypot' },
						{ label: 'Galah (HTTP + AI)', slug: 'services/galah' },
						{ label: 'Dionaea (Multi-Protocol)', slug: 'services/dionaea' },
						{ label: 'Sensor Health Monitoring', slug: 'services/sensors' },
						{ label: 'Vector (Log Shipper)', slug: 'services/vector' },
					],
				},
				{
					label: 'Platform',
					items: [
						{ label: 'Ingest API', slug: 'services/ingest-api' },
						{ label: 'Dashboard', slug: 'services/dashboard' },
						{ label: 'Discord Alerts', slug: 'services/discord-alerts' },
					],
				},
				{ label: 'Security', slug: 'security' },
				{ label: 'API Reference', slug: 'api-reference' },
			],
		}),
	],
});
