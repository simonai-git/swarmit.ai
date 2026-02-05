import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        email: 'test@example.com',
        name: 'Test User',
      },
    },
    status: 'authenticated',
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getServerSession: vi.fn(() => Promise.resolve({
    user: { email: 'test@example.com', name: 'Test User' },
  })),
}));

// Mock environment variables
process.env.SIMON_API_KEY = 'test-api-key';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.NEXTAUTH_SECRET = 'test-secret';

// Mock fetch globally
global.fetch = vi.fn();

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
