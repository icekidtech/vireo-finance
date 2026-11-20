import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './components/HomePage'
import PersonalLanding from './components/PersonalLanding'
import MerchantLanding from './components/MerchantLanding'
import DevelopersPage from './components/DevelopersPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/personal" element={<PersonalLanding />} />
        <Route path="/merchant" element={<MerchantLanding />} />
        <Route path="/developers" element={<DevelopersPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
