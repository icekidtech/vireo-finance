import { useState } from 'react'
import PersonalLanding from './components/PersonalLanding'
import MerchantLanding from './components/MerchantLanding'

function App() {
  const [view, setView] = useState<'personal' | 'merchant'>('personal')

  if (view === 'personal') {
    return <PersonalLanding onSwitch={() => setView('merchant')} />
  }

  return <MerchantLanding onSwitch={() => setView('personal')} />
}

export default App
