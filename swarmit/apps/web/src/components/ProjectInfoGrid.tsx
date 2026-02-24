import {
  Target,
  Users,
  CheckCircle2,
  ListTodo,
  Clock,
  DollarSign,
  Mail,
  Shield,
  Link2,
} from 'lucide-react';
import type { Project } from '@/lib/api';

export function InfoItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-zinc-500 mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-xs text-zinc-500 block">{label}</span>
        <span className="text-sm text-zinc-300">{children}</span>
      </div>
    </div>
  );
}

export function ProjectInfoGrid({ project }: { project: Project }) {
  const hasInfo = project.projectType || project.goal || project.targetUsers ||
    (project.mustHaves && project.mustHaves.length > 0) ||
    (project.niceToHaves && project.niceToHaves.length > 0) ||
    project.deadline || project.budgetRange || project.contactEmail ||
    project.constraints || project.dataSensitivity ||
    (project.referenceLinks && project.referenceLinks.length > 0);

  if (!hasInfo) return null;

  return (
    <div>
      <h4 className="text-sm font-medium text-zinc-400 mb-2">Project Info</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-3">
        {project.projectType && (
          <InfoItem icon={<Target className="w-3.5 h-3.5" />} label="Type">
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400">
              {project.projectType}
            </span>
          </InfoItem>
        )}
        {project.goal && (
          <InfoItem icon={<Target className="w-3.5 h-3.5" />} label="Goal">
            {project.goal}
          </InfoItem>
        )}
        {project.targetUsers && (
          <InfoItem icon={<Users className="w-3.5 h-3.5" />} label="Target Users">
            {project.targetUsers}
          </InfoItem>
        )}
        {project.mustHaves && project.mustHaves.length > 0 && (
          <InfoItem icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Must-Haves">
            <div className="flex flex-wrap gap-1 mt-0.5">
              {project.mustHaves.map((item, i) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">
                  {item}
                </span>
              ))}
            </div>
          </InfoItem>
        )}
        {project.niceToHaves && project.niceToHaves.length > 0 && (
          <InfoItem icon={<ListTodo className="w-3.5 h-3.5" />} label="Nice-to-Haves">
            <div className="flex flex-wrap gap-1 mt-0.5">
              {project.niceToHaves.map((item, i) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-zinc-500/20 text-zinc-400">
                  {item}
                </span>
              ))}
            </div>
          </InfoItem>
        )}
        {project.deadline && (
          <InfoItem icon={<Clock className="w-3.5 h-3.5" />} label="Deadline">
            {new Date(project.deadline).toLocaleDateString()}
          </InfoItem>
        )}
        {project.budgetRange && (
          <InfoItem icon={<DollarSign className="w-3.5 h-3.5" />} label="Budget">
            {project.budgetRange}
          </InfoItem>
        )}
        {project.contactEmail && (
          <InfoItem icon={<Mail className="w-3.5 h-3.5" />} label="Contact">
            {project.contactEmail}
          </InfoItem>
        )}
        {project.constraints && (
          <InfoItem icon={<Shield className="w-3.5 h-3.5" />} label="Constraints">
            {project.constraints}
          </InfoItem>
        )}
        {project.dataSensitivity && (
          <InfoItem icon={<Shield className="w-3.5 h-3.5" />} label="Data Sensitivity">
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400">
              {project.dataSensitivity}
            </span>
          </InfoItem>
        )}
        {project.referenceLinks && project.referenceLinks.length > 0 && (
          <InfoItem icon={<Link2 className="w-3.5 h-3.5" />} label="References">
            <div className="flex flex-col gap-0.5 mt-0.5">
              {project.referenceLinks.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-xs truncate block"
                >
                  {link}
                </a>
              ))}
            </div>
          </InfoItem>
        )}
      </div>
    </div>
  );
}
