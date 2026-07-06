// apps/web/tailwind.config.ts
// Tema estendido — Design System Projeto Pérsia v4 §16
// Estética GestãoClick (AdminLTE 3 + Bootstrap 4.5.3).

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
    './src/globals.css', // OBRIGATÓRIO — inclui classes @layer components no purge (DS v4 §19)
  ],
  theme: {
    extend: {
      colors: {
        brand: '#000000',
        primary: '#0073b7',
        action: {
          add: '#00a65a',
          'add-border': '#008d4c',
          view: '#00c0ef',
          edit: '#f39c12',
          delete: '#f56954',
        },
        success: {
          DEFAULT: '#28a745',
          subtle: '#d4edda',
          border: '#c3e6cb',
        },
        warning: {
          DEFAULT: '#ffc107',
          subtle: '#fff3cd',
          border: '#ffeeba',
        },
        error: {
          DEFAULT: '#dc3545',
          subtle: '#f8d7da',
          border: '#f5c6cb',
        },
        info: {
          DEFAULT: '#17a2b8',
          subtle: '#d1ecf1',
          border: '#bee5eb',
        },
        neutral: {
          0: '#ffffff',
          50: '#f9f9f9',
          100: '#f4f4f4',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#ced4da',
          500: '#6c757d',
          600: '#495057',
          700: '#343a40',
          800: '#212529',
          900: '#000000',
        },
        surface: {
          app: '#f9f9f9',
          card: '#ffffff',
          sidebar: '#f4f4f4',
          header: '#000000',
        },
        status: {
          'sent-bg': '#d4edda',
          'sent-text': '#155724',
          'draft-bg': '#e9ecef',
          'draft-text': '#495057',
          'error-bg': '#f8d7da',
          'error-text': '#721c24',
        },
      },
      fontFamily: {
        ui: ['Source Sans Pro', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xl-ui': ['24px', { lineHeight: '1.2' }],
        'xl-ui': ['20px', { lineHeight: '1.3' }],
        'lg-ui': ['16px', { lineHeight: '1.5' }],
        'md-ui': ['14px', { lineHeight: '1.5' }],
        'sm-ui': ['13px', { lineHeight: '1.5' }],
        'xs-ui': ['12px', { lineHeight: '1.5' }],
        '2xs-ui': ['11px', { lineHeight: '1.4' }],
      },
      borderRadius: {
        xs: '2px',
        sm: '3px',
        DEFAULT: '4px',
        full: '9999px',
      },
      boxShadow: {
        btn: 'inset 0 -1px 0 rgba(0,0,0,0.09)',
        sidebar: 'inset -3px 0 8px -4px rgba(0,0,0,0.07)',
        dropdown: '0 3px 6px 0 rgba(0,0,0,0.1)',
        modal: '0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10)',
        toast: '0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10)',
      },
      width: { sidebar: '220px' },
      height: { header: '50px' },
      maxWidth: { form: '640px', content: '1200px' },
    },
  },
  plugins: [],
};

export default config;
