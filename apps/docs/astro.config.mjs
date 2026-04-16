// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Honeypot Platform',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/elrichi31/honeypot-ai' }],
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
					],
				},
				{
					label: 'Services',
					items: [
						{ label: 'SSH Honeypot (Cowrie)', slug: 'services/cowrie' },
						{ label: 'Web Honeypot', slug: 'services/web-honeypot' },
						{ label: 'Ingest API', slug: 'services/ingest-api' },
						{ label: 'Log Puller', slug: 'services/log-puller' },
						{ label: 'Dashboard', slug: 'services/dashboard' },
					],
				},
				{ label: 'Security', slug: 'security' },
				{ label: 'API Reference', slug: 'api-reference' },
			],
		}),
	],
});
