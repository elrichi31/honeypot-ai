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
				{ label: 'Introducción', slug: 'intro' },
				{ label: 'Arquitectura', slug: 'architecture' },
				{
					label: 'Primeros pasos',
					items: [
						{ label: 'Desarrollo local', slug: 'getting-started/local-dev' },
						{ label: 'Instalar un sensor', slug: 'getting-started/installing-a-sensor' },
						{ label: 'Variables de entorno', slug: 'getting-started/env-vars' },
					],
				},
				{
					label: 'Despliegue',
					items: [
						{ label: 'Single-host (un VPS)', slug: 'deployment/single-host' },
						{ label: 'Two-host (recomendado)', slug: 'deployment/two-host' },
						{ label: 'Lab multi-VM local', slug: 'deployment/multi-vm-local' },
					],
				},
				{
					label: 'Sensores',
					items: [
						{ label: 'SSH Honeypot (Cowrie)', slug: 'services/cowrie' },
						{ label: 'Web Honeypot', slug: 'services/web-honeypot' },
						{ label: 'Galah (HTTP + IA)', slug: 'services/galah' },
						{ label: 'Dionaea (multi-protocolo)', slug: 'services/dionaea' },
						{ label: 'FTP y MySQL', slug: 'services/ftp-mysql' },
						{ label: 'Salud de sensores', slug: 'services/sensors' },
						{ label: 'Vector (log shipper)', slug: 'services/vector' },
					],
				},
				{
					label: 'Plataforma',
					items: [
						{ label: 'Ingest API', slug: 'services/ingest-api' },
						{ label: 'Dashboard', slug: 'services/dashboard' },
						{ label: 'Clientes y enrutado de sensores', slug: 'services/clients' },
						{ label: 'Multi-tenant', slug: 'services/multi-tenant' },
						{ label: 'Alertas de Discord', slug: 'services/discord-alerts' },
					],
				},
				{
					label: 'Inteligencia de amenazas',
					items: [
						{ label: 'Threat Intelligence', slug: 'intelligence/threat-intelligence' },
						{ label: 'IoCs', slug: 'intelligence/iocs' },
						{ label: 'Suricata (IDS)', slug: 'intelligence/suricata' },
						{ label: 'Malware y captura de archivos', slug: 'intelligence/malware' },
						{ label: 'Red de engaño', slug: 'intelligence/deception' },
					],
				},
				{
					label: 'Operación',
					items: [
						{ label: 'Monitoreo', slug: 'operations/monitoring' },
						{ label: 'Almacenamiento y retención', slug: 'operations/storage' },
						{ label: 'Defensa de la API', slug: 'operations/api-defense' },
						{ label: 'Gestión de usuarios', slug: 'services/user-management' },
						{ label: 'Registro de auditoría', slug: 'services/audit-log' },
					],
				},
				{
					label: 'Referencia',
					items: [
						{ label: 'Seguridad', slug: 'security' },
						{ label: 'API Reference', slug: 'api-reference' },
					],
				},
			],
		}),
	],
});
