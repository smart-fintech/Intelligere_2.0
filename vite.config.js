import { fileURLToPath, URL } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The third argument is the prefix filter. '' means "load everything",
  // including variables WITHOUT the VITE_ prefix - which is the point: those
  // are readable here, in Node, but are never put into the browser bundle.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss()
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },

    /* -------------------------------------------------------------- */
    /* Dev-only proxies                                               */
    /* -------------------------------------------------------------- */
    server: {
      proxy: {
        /**
         * THE GST LOOKUP - DEVELOPMENT ONLY.
         *
         * The browser refuses to hand us Alankit's reply because that server
         * sends no Access-Control-Allow-Origin header:
         *
         *   Access to XMLHttpRequest ... has been blocked by CORS policy
         *
         * There is nothing the front-end code can do about that - the header
         * has to come from THEIR server. What we can do is stop the browser
         * making a cross-origin request at all: the page calls /gst-api on
         * our own dev server, and Vite (Node, where CORS does not apply)
         * forwards it to Alankit and passes the answer back.
         *
         * The subscription key is added HERE rather than in the app, so it
         * stays out of the JavaScript bundle. That is why it is read from
         * GST_SUBSCRIPTION_KEY and not VITE_GST_SUBSCRIPTION_KEY - Vite only
         * bundles the VITE_ ones.
         *
         * ------------------------------------------------------------
         * THIS ONLY WORKS IN `npm run dev`
         * ------------------------------------------------------------
         * A built site has no Vite server in front of it, so the same call
         * from production would be blocked again. Before deploying, put the
         * lookup behind our own backend - the old Django GstDetails view
         * already does exactly this - and point VITE_GST_LOOKUP_URL at it.
         * See Services/gstService, which handles that endpoint's response
         * shape as well as this one.
         */
        '/gst-api': {
          target: env.GST_UPSTREAM_URL || 'https://gsp.alankitgst.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/gst-api/, ''),
          headers: env.GST_SUBSCRIPTION_KEY
            ? { 'Ocp-Apim-Subscription-Key': env.GST_SUBSCRIPTION_KEY }
            : {},
        },
      },
    },
  }
})
