import { useNavigate } from 'react-router';
import { useEffect } from 'react';

// Root / redirects to /dashboard
export default function LandingPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/dashboard', { replace: true });
  }, [navigate]);
  return null;
}
