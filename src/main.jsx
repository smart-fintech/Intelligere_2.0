import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'

import { removeObsoleteKeys } from './Library/secureStorage.js'
import { store } from './Store/store.js'
import './Styles/CSS/index.css'
import App from './App.jsx'

// Drops what older builds left in localStorage and nothing reads any more
// (see OBSOLETE_KEYS in secureStorage). Once, before anything renders, so no
// screen can ever read one of them.
removeObsoleteKeys()

// <BrowserRouter> is the piece that connects React to the browser address bar.
// It has to sit ABOVE everything that uses routing, so it goes here at the very
// top - that way <Routes>, <Link> and useNavigate() work anywhere in the app.
//
// "Browser" router means real URLs (/login, /register). It needs the server to
// send index.html for any path; Vite's dev server already does this, and on
// deploy your host needs the same SPA fallback rule.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* <Provider> hands the Redux store to the whole app, the same way
        <BrowserRouter> hands down routing. It has to sit above anything
        that calls useSelector or useDispatch, so it goes here at the top. */}
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
