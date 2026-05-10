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
					tag: 'link',
					attrs: { rel: 'stylesheet', href: '/styles/mermaid.css' },
				},
				{
					tag: 'script',
					attrs: { type: 'module', src: '/scripts/mermaid-init.js' },
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
						{ label: 'Clients and Sensor Routing', slug: 'services/clients' },
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
