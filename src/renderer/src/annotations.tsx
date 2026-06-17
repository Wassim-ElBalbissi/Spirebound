import React from 'react'
import { createRoot } from 'react-dom/client'
import { AnnotationRoot } from './AnnotationRoot'
import './styles/tailwind.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root missing in annotations.html')

createRoot(container).render(
  <React.StrictMode>
    <AnnotationRoot />
  </React.StrictMode>
)
