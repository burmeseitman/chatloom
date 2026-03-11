/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                white: 'rgb(var(--tw-color-white) / <alpha-value>)',
                gray: {
                    300: 'rgb(var(--tw-color-gray-300) / <alpha-value>)',
                    400: 'rgb(var(--tw-color-gray-400) / <alpha-value>)',
                    500: 'rgb(var(--tw-color-gray-500) / <alpha-value>)',
                    600: 'rgb(var(--tw-color-gray-600) / <alpha-value>)',
                }
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out forwards',
                'slide-up': 'slideUp 0.3s ease-out forwards',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                }
            }
        },
    },
    plugins: [],
}
