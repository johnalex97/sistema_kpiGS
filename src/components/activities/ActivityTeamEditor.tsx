import { Plus, Trash2 } from "lucide-react";
import type { ActivityTeamInput, TechnicianOption } from "../../models/activity";
import { activityTeamErrors } from "./activity-team.validation";

export interface ActivityTeamEditorProps {
  members: ActivityTeamInput[];
  technicians: TechnicianOption[];
  onChange(members: ActivityTeamInput[]): void;
  onConfirm?(members: ActivityTeamInput[]): void;
  showConfirm?: boolean;
}

export function ActivityTeamEditor({ members, technicians, onChange, onConfirm, showConfirm = true }: ActivityTeamEditorProps) {
  const errors = activityTeamErrors(members);
  const technicianName = (id: string) => technicians.find((technician) => technician.id === id)?.fullName ?? "Técnico sin seleccionar";
  const update = (index: number, patch: Partial<ActivityTeamInput>) => onChange(members.map((member, position) => position === index ? { ...member, ...patch } : member));

  return <section className="activity-team-editor" aria-labelledby="activity-team-title">
    <div className="activity-team-editor__head"><div><p className="eyebrow">Distribución del trabajo</p><h3 id="activity-team-title">Equipo técnico</h3></div><button className="button button--ghost" type="button" onClick={() => onChange([...members, { technicianId: "", role: "PARTICIPANT", participationPercentage: "0.00" }])}><Plus size={14} />Agregar técnico</button></div>
    <div className="activity-team-editor__rows">{members.map((member, index) => {
      const name = technicianName(member.technicianId);
      return <div className="activity-team-member" key={`${index}-${member.technicianId}`}>
        <label><span>Técnico</span><select aria-label={`Técnico ${index + 1}`} value={member.technicianId} onChange={(event) => update(index, { technicianId: event.target.value })}><option value="">Seleccionar</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.code} · {technician.fullName}</option>)}</select></label>
        <label><span>Rol</span><select aria-label={`Rol de ${name}`} value={member.role} onChange={(event) => update(index, { role: event.target.value as ActivityTeamInput["role"] })}><option value="RESPONSIBLE">Responsable</option><option value="PARTICIPANT">Participante</option></select></label>
        <label><span>Participación</span><div className="percentage-input"><input aria-label={`Participación de ${name}`} inputMode="decimal" value={member.participationPercentage} onChange={(event) => update(index, { participationPercentage: event.target.value })} /><b>%</b></div></label>
        <button className="icon-button" type="button" aria-label={`Quitar ${name}`} onClick={() => onChange(members.filter((_, position) => position !== index))}><Trash2 size={15} /></button>
      </div>;
    })}</div>
    {errors.map((error) => <p className="form-error" role="alert" key={error}>{error}</p>)}
    {showConfirm && <div className="activity-team-editor__confirm"><button className="button button--primary" type="button" disabled={errors.length > 0} onClick={() => onConfirm?.(members)}>Confirmar equipo</button></div>}
  </section>;
}
