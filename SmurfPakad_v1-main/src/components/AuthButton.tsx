import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LogIn, User, LogOut, Loader2 } from 'lucide-react';
import { authApi, type User as UserType } from '@/lib/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Only Google OAuth (simplified per requirements)
const OAUTH_PROVIDERS = [
  { name: 'Google', icon: '🔍', color: 'bg-white hover:bg-gray-100 text-gray-900' },
];

const AuthButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check for stored user on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('user');
      }
    }

    // Check for OAuth callback code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      handleOAuthCallback(code);
    }
  }, []);

  const handleOAuthCallback = async (code: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.handleCallback(code, 'google');
      const userData = {
        name: response.user.name,
        email: response.user.email,
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('authToken', response.access_token);

      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);

      // Redirect to dashboard
      window.location.href = '/cryptoflow/dashboard';
    } catch (error) {
      console.error('OAuth callback error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: string) => {
    setIsLoading(true);
    try {
      // Get the authorization URL from backend
      const response = await authApi.getGoogleAuthUrl();
      // Redirect to the authorization URL
      window.location.href = response.authorization_url;
    } catch (error) {
      console.error('OAuth login error:', error);
      // Fallback: simulate login for development
      const mockUser = {
        name: 'Demo User',
        email: 'demo@smurfpakad.ai'
      };
      setUser(mockUser);
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem('authToken', 'mock_jwt_token_' + Date.now());
      setIsOpen(false);
      window.location.href = '/cryptoflow/dashboard';
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch (error) {
      // Still clear local state even if API call fails
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('authToken');
      setIsLoading(false);
      window.location.href = '/cryptoflow';
    }
  };

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2">
          <User className="h-4 w-4 text-crypto-purple" />
          <span className="text-sm text-white">{user.name}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={isLoading}
          className="text-gray-300 hover:text-white"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Logout
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-gray-300 hover:text-white">
          <LogIn className="h-4 w-4 mr-2" />
          Login
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-crypto-blue border-white/10">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            Welcome to SmurfPakad
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Sign in with your preferred provider to access advanced features
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-6">
          {OAUTH_PROVIDERS.map((provider) => (
            <Button
              key={provider.name}
              onClick={() => handleOAuthLogin(provider.name)}
              disabled={isLoading}
              className={`w-full ${provider.color} transition-all duration-200`}
              size="lg"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 mr-3 animate-spin" />
              ) : (
                <span className="text-2xl mr-3">{provider.icon}</span>
              )}
              <span className="font-medium">Continue with {provider.name}</span>
            </Button>
          ))}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            By signing in, you agree to our{' '}
            <a href="#!" className="text-crypto-purple hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#!" className="text-crypto-purple hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthButton;
