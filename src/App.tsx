import { Suspense, lazy } from 'react'
import './App.css'

const SeatPicker = lazy(() => import('./components/SeatPicker'))

function App() {
  return (
    <Suspense fallback={<div style={{ padding: '50px', textAlign: 'center' }}>Cargando aplicación...</div>}>
      <SeatPicker />
    </Suspense>
  )
}

export default App
