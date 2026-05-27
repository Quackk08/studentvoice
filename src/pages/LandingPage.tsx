import FabNav from '../components/landing/FabNav'
import FabHero from '../components/landing/FabHero'
import TrustStrip from '../components/landing/TrustStrip'
import BentoSection from '../components/landing/BentoSection'
import HowSection from '../components/landing/HowSection'
import FabCTA from '../components/landing/FabCTA'
import Footer from '../components/shared/Footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-ink tracking-tight">
      <FabNav />
      <FabHero />
      <TrustStrip />
      <BentoSection />
      <HowSection />
      <FabCTA />
      <Footer />
    </div>
  )
}
