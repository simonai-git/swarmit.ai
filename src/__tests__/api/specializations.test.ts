import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  getSpecializations: vi.fn(),
  seedDefaultSpecializations: vi.fn(),
  createSpecialization: vi.fn(),
  getSpecialization: vi.fn(),
  updateSpecialization: vi.fn(),
  deleteSpecialization: vi.fn(),
  getSpecializationAgentCount: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({
    user: { email: 'test@user.com', name: 'Test User' },
  })),
}));

import { GET, POST } from '@/app/api/specializations/route';
import { GET as GET_ONE, PATCH, DELETE } from '@/app/api/specializations/[id]/route';
import {
  getSpecializations,
  seedDefaultSpecializations,
  createSpecialization,
  getSpecialization,
  updateSpecialization,
  deleteSpecialization,
  getSpecializationAgentCount,
} from '@/lib/db';

describe('API /api/specializations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/specializations', () => {
    it('should return specializations for current user', async () => {
      const mockSpecs = [
        { id: 'spec-1', name: 'Full Stack Developer', icon: '🚀', is_default: true },
      ];
      vi.mocked(getSpecializations).mockResolvedValue(mockSpecs as any);

      const request = new NextRequest('http://localhost/api/specializations');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(getSpecializations).toHaveBeenCalledWith('test@user.com');
    });

    it('should auto-seed defaults when user has none', async () => {
      vi.mocked(getSpecializations)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'spec-1', name: 'Full Stack Developer' }] as any);
      vi.mocked(seedDefaultSpecializations).mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/specializations');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(seedDefaultSpecializations).toHaveBeenCalledWith('test@user.com');
      expect(data).toHaveLength(1);
    });

    it('should not re-seed when user already has specializations', async () => {
      const mockSpecs = [{ id: 'spec-1', name: 'DevOps' }];
      vi.mocked(getSpecializations).mockResolvedValue(mockSpecs as any);

      const request = new NextRequest('http://localhost/api/specializations');
      await GET(request);

      expect(seedDefaultSpecializations).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/specializations', () => {
    it('should create a specialization', async () => {
      const created = { id: 'spec-new', name: 'Blockchain Dev', icon: '🔗', user_email: 'test@user.com' };
      vi.mocked(createSpecialization).mockResolvedValue(created as any);

      const request = new NextRequest('http://localhost/api/specializations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Blockchain Dev', icon: '🔗', description: 'Web3' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.name).toBe('Blockchain Dev');
      expect(createSpecialization).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Blockchain Dev', user_email: 'test@user.com' })
      );
    });

    it('should return 400 when name missing', async () => {
      const request = new NextRequest('http://localhost/api/specializations', {
        method: 'POST',
        body: JSON.stringify({ description: 'No name' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should return 409 for duplicate name', async () => {
      vi.mocked(createSpecialization).mockRejectedValue({ code: '23505' });

      const request = new NextRequest('http://localhost/api/specializations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Duplicate' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/specializations/[id]', () => {
    it('should return a single specialization', async () => {
      const mockSpec = { id: 'spec-1', name: 'Backend Developer' };
      vi.mocked(getSpecialization).mockResolvedValue(mockSpec as any);

      const request = new NextRequest('http://localhost/api/specializations/spec-1');
      const response = await GET_ONE(request, { params: Promise.resolve({ id: 'spec-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('Backend Developer');
    });

    it('should return 404 when not found', async () => {
      vi.mocked(getSpecialization).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/specializations/nope');
      const response = await GET_ONE(request, { params: Promise.resolve({ id: 'nope' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/specializations/[id]', () => {
    it('should update a specialization', async () => {
      const updated = { id: 'spec-1', name: 'Updated', description: 'New desc' };
      vi.mocked(updateSpecialization).mockResolvedValue(updated as any);

      const request = new NextRequest('http://localhost/api/specializations/spec-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'spec-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('Updated');
    });

    it('should return 404 when spec not found', async () => {
      vi.mocked(updateSpecialization).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/specializations/nope', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'X' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'nope' }) });

      expect(response.status).toBe(404);
    });

    it('should return 409 for duplicate name on update', async () => {
      vi.mocked(updateSpecialization).mockRejectedValue({ code: '23505' });

      const request = new NextRequest('http://localhost/api/specializations/spec-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Taken' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'spec-1' }) });

      expect(response.status).toBe(409);
    });
  });

  describe('DELETE /api/specializations/[id]', () => {
    it('should delete a specialization with no agents', async () => {
      vi.mocked(getSpecialization).mockResolvedValue({ id: 'spec-1', name: 'Old', user_email: 'test@user.com' } as any);
      vi.mocked(getSpecializationAgentCount).mockResolvedValue(0);
      vi.mocked(deleteSpecialization).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/specializations/spec-1', { method: 'DELETE' });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'spec-1' }) });

      expect(response.status).toBe(200);
    });

    it('should return 409 when agents use the specialization', async () => {
      vi.mocked(getSpecialization).mockResolvedValue({ id: 'spec-1', name: 'InUse', user_email: 'test@user.com' } as any);
      vi.mocked(getSpecializationAgentCount).mockResolvedValue(3);

      const request = new NextRequest('http://localhost/api/specializations/spec-1', { method: 'DELETE' });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'spec-1' }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain('3 agent(s)');
    });

    it('should return 404 when spec not found', async () => {
      vi.mocked(getSpecialization).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/specializations/nope', { method: 'DELETE' });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'nope' }) });

      expect(response.status).toBe(404);
    });
  });
});
