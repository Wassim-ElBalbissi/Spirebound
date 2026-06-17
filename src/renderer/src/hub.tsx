import React from 'react'
import { createRoot } from 'react-dom/client'
import { HubRoot } from './HubRoot'
import './styles/tailwind.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root element missing')

createRoot(container).render(
  <React.StrictMode>
    <HubRoot />
  </React.StrictMode>
)
