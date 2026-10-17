
import { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import Testimonials from '@/components/Testimonials';
import Pricing from '@/components/Pricing';
import FAQ from '@/components/FAQ';
import CTA from '@/components/CTA';
import Footer from '@/components/Footer';
import ScrollToTop from '@/components/ScrollToTop';
import ChatBot from '@/components/ChatBot';
import useScrollAnimation from '@/utils/useScrollAnimation';

const Index = () => {
  // Initialize scroll animations
  useScrollAnimation();

  // Set page title
  useEffect(() => {
    document.title = "SmurfPakad | AI-Powered Blockchain Money Laundering Detection";
    
    // Check if we are receiving an OAuth callback (code parameter)
    // This happens if the user registered the root URL as the redirect URI
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('code')) {
      window.location.href = `/cryptoflow/auth/callback${window.location.search}`;
    }
  }, []);
  
  return (
    <div className="min-h-screen bg-[#0a0a14] transition-colors duration-300">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
      <ScrollToTop />
      <ChatBot />
    </div>
  );
};

export default Index;
