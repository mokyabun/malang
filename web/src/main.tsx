import { RouterProvider } from '@tanstack/react-router'
import { Provider } from 'jotai'
import ReactDOM from 'react-dom/client'

import { getRouter } from './router'

const router = getRouter()

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
        <Provider>
            <RouterProvider router={router} />
        </Provider>,
    )
}
