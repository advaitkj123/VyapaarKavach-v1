
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const CTA = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-crypto-blue to-[#12141C] relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-crypto-purple/10 rounded-full filter blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-crypto-light-purple/10 rounded-full filter blur-3xl animate-pulse-slow" style={{ animationDelay: '1.5s' }}></div>
      </div>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8 md:p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 animate-fade-in">
            Ready to combat <span className="text-gradient">money laundering</span> in blockchain?
          </h2>
          <p className="text-gray-300 text-lg mb-8 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: '0.2s' }}>
            SmurfPakad combines Graph Neural Networks with IBM watsonx.ai to detect illicit patterns across 
            Paytm, PhonePe, and GPay — in real-time, before money leaves your wallet.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <Link to="/cryptoflow/dashboard">
              <Button size="lg" className="bg-crypto-purple hover:bg-crypto-dark-purple text-white px-8 py-6 shadow-lg shadow-crypto-purple/25">
                Open Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/cryptoflow/threats">
              <Button variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/5 py-6">
                <Shield className="mr-2 h-5 w-5" />
                View Live Threats
              </Button>
            </Link>
          </div>
          {/* IBM Powered Footer */}
          <div className="mt-8 flex items-center justify-center gap-3 animate-fade-in" style={{ animationDelay: '0.6s' }}>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
              <span className="text-blue-400 font-bold text-xs">IBM</span>
              <span className="text-blue-300/60 text-[10px]">watsonx.ai</span>
            </div>
            <span className="text-gray-500 text-xs">×</span>
            <span className="text-gray-400 text-xs">GraphSAGE GNN</span>
            <span className="text-gray-500 text-xs">×</span>
            <span className="text-gray-400 text-xs">SafeGuard Shield</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
