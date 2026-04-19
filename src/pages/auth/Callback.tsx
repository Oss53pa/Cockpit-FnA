import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

/** Handles OAuth / Magic Link redirect callback */
export default function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/', { replace: true });
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary-300 border-t-primary-700 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-primary-500">Authentification en cours...</p>
      </div>
    </div>
  );
}
