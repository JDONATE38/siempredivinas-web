/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		extend: {
			colors: {
				// Colores corporativos
				'gold': { DEFAULT: '#C5A059', 600: '#96732C' }, 
				'pink': { brand: '#F6A8C3', 600: '#D61C4E' }    
			},
			fontFamily: {
				serif: ['"Playfair Display"', 'serif'],
				sans: ['"Inter"', 'sans-serif'],
			},
		},
	},
	plugins: [],
}