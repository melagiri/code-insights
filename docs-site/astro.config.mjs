// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://docs.code-insights.app',
	integrations: [
		starlight({
			title: 'Code Insights',
			description: 'Understand your AI coding sessions',
			logo: {
				src: './src/assets/logo.svg',
				alt: 'Code Insights',
			},
			customCss: ['./src/styles/custom.css'],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/melagiri/code-insights' },
				{ icon: 'external', label: 'Open Dashboard', href: 'https://code-insights.app' },
			],
			head: [
				{
					tag: 'meta',
					attrs: { name: 'theme-color', content: '#7c3aed' },
				},
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Firebase Setup', slug: 'guides/firebase-setup' },
						{ label: 'Syncing Sessions', slug: 'guides/syncing-sessions' },
						{ label: 'Web Dashboard', slug: 'guides/web-dashboard' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'CLI Commands', slug: 'reference/commands' },
						{ label: 'Firestore Schema', slug: 'reference/schema' },
					],
				},
				{
					label: 'Contributing',
					slug: 'contributing',
				},
			],
			editLink: {
				baseUrl: 'https://github.com/melagiri/code-insights/edit/master/docs-site/',
			},
		}),
	],
});
