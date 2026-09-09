import { AlertTriangle, ClipboardCheck, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import type {
  AnalyzeRecurrenceInput,
  RecurrenceCatalog,
  RecurrenceImpact,
  RecurrenceTechnician,
} from "../../models/recurrence";

type AnalysisInput = Omit<AnalyzeRecurrenceInput, "version">;
type Responsibility = AnalyzeRecurrenceInput["responsibility"];
type InvalidField = "cause" | "impact" | "responsibility" | "analysis" | "cost" | "costReason" | "age" | "quality" | "justification";

interface DecisionDraft {
  affectsQuality: boolean;
  justification: string;
}

const costPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const impactLabel: Record<RecurrenceImpact, string> = { LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto" };
const responsibilityLabel: Record<Responsibility, string> = {
  TECHNICAL_WORK: "Trabajo técnico",
  EQUIPMENT: "Equipo",
  CLIENT: "Cliente",
  THIRD_PARTY: "Tercero",
};

export interface RecurrenceAnalysisFormProps {
  catalog: RecurrenceCatalog;
  originalTechnicians: readonly RecurrenceTechnician[];
  apiError?: string | null;
  onSubmit(input: AnalysisInput): Promise<boolean>;
  onCancel(): void;
}

function uniqueOriginalTechnicians(technicians: readonly RecurrenceTechnician[]): RecurrenceTechnician[] {
  const unique = new Map<string, RecurrenceTechnician>();
  for (const entry of technicians) {
    if (entry.participation !== "CORRECTION_PARTICIPANT" && !unique.has(entry.technician.id)) {
      unique.set(entry.technician.id, entry);
    }
  }
  return [...unique.values()];
}

export function RecurrenceAnalysisForm({
  catalog,
  originalTechnicians,
  apiError = null,
  onSubmit,
  onCancel,
}: RecurrenceAnalysisFormProps) {
  const technicians = useMemo(() => uniqueOriginalTechnicians(originalTechnicians), [originalTechnicians]);
  const [causeId, setCauseId] = useState("");
  const [impact, setImpact] = useState<RecurrenceImpact | "">("");
  const [responsibility, setResponsibility] = useState<Responsibility | "">("");
  const [analysis, setAnalysis] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [costReason, setCostReason] = useState("");
  const [ageOverrideReason, setAgeOverrideReason] = useState("");
  const [decisions, setDecisions] = useState<Record<string, DecisionDraft>>(() => Object.fromEntries(
    technicians.map((entry) => [entry.technician.id, { affectsQuality: false, justification: "" }]),
  ));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<InvalidField | null>(null);
  const [invalidTechnicianId, setInvalidTechnicianId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const causeRef = useRef<HTMLSelectElement>(null);
  const impactRef = useRef<HTMLSelectElement>(null);
  const responsibilityRef = useRef<HTMLSelectElement>(null);
  const analysisRef = useRef<HTMLTextAreaElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const costReasonRef = useRef<HTMLTextAreaElement>(null);
  const ageRef = useRef<HTMLTextAreaElement>(null);
  const checkboxRefs = useRef(new Map<string, HTMLInputElement>());
  const justificationRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingRef = useRef(false);
  const cancelRef = useRef(onCancel);

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    if (!apiError) return;
    analysisRef.current?.focus();
  }, [apiError]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    causeRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!pendingRef.current) cancelRef.current();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const clearValidation = () => {
    setValidationError(null);
    setInvalidField(null);
    setInvalidTechnicianId(null);
  };

  const reject = (
    field: InvalidField,
    message: string,
    target: RefObject<HTMLElement | null> | HTMLElement | null,
    technicianId: string | null = null,
  ) => {
    setValidationError(message);
    setInvalidField(field);
    setInvalidTechnicianId(technicianId);
    const element = target && "current" in target ? target.current : target;
    element?.focus();
  };

  const selectResponsibility = (value: string) => {
    const next = value as Responsibility | "";
    setResponsibility(next);
    clearValidation();
    if (next !== "TECHNICAL_WORK") {
      setDecisions((current) => Object.fromEntries(Object.keys(current).map((id) => [id, { affectsQuality: false, justification: "" }])));
    }
  };

  const setAffectsQuality = (technicianId: string, affectsQuality: boolean) => {
    setDecisions((current) => ({
      ...current,
      [technicianId]: {
        affectsQuality,
        justification: affectsQuality ? current[technicianId]?.justification ?? "" : "",
      },
    }));
    clearValidation();
  };

  const setJustification = (technicianId: string, justification: string) => {
    setDecisions((current) => ({
      ...current,
      [technicianId]: { affectsQuality: current[technicianId]?.affectsQuality ?? false, justification },
    }));
    clearValidation();
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = Array.from(formRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;

    const normalizedAnalysis = analysis.trim();
    const normalizedCost = estimatedCost.trim();
    const normalizedCostReason = costReason.trim();
    const normalizedAgeReason = ageOverrideReason.trim();
    const selectedCause = catalog.causes.some((cause) => cause.id === causeId);
    if (!selectedCause) return reject("cause", "Selecciona una causa disponible.", causeRef);
    if (!impact || !catalog.impacts.includes(impact)) return reject("impact", "Selecciona el impacto del caso.", impactRef);
    if (!responsibility || !catalog.responsibilities.includes(responsibility)) {
      return reject("responsibility", "Selecciona una responsabilidad determinada.", responsibilityRef);
    }
    if (normalizedAnalysis.length < 3) return reject("analysis", "Describe el análisis con al menos 3 caracteres.", analysisRef);
    if (normalizedAnalysis.length > 10_000) return reject("analysis", "El análisis no puede superar 10,000 caracteres.", analysisRef);
    if (normalizedCost && !costPattern.test(normalizedCost)) {
      return reject("cost", "Ingresa un costo con formato válido y hasta dos decimales.", costRef);
    }
    if (Boolean(normalizedCost) !== Boolean(normalizedCostReason)) {
      return reject(
        normalizedCost ? "costReason" : "cost",
        "El costo estimado y su razón deben completarse juntos.",
        normalizedCost ? costReasonRef : costRef,
      );
    }
    if (normalizedCostReason.length > 500) return reject("costReason", "La razón del costo no puede superar 500 caracteres.", costReasonRef);
    if (normalizedAgeReason.length > 500) return reject("age", "El motivo de antigüedad no puede superar 500 caracteres.", ageRef);

    const drafts = technicians.map((entry) => ({ entry, draft: decisions[entry.technician.id] ?? { affectsQuality: false, justification: "" } }));
    if (responsibility === "TECHNICAL_WORK") {
      const affected = drafts.filter(({ draft }) => draft.affectsQuality);
      if (affected.length === 0) {
        return reject(
          "quality",
          technicians.length ? "Marca al menos un técnico cuya calidad resulte afectada." : "No hay técnicos originales disponibles para atribuir la calidad.",
          checkboxRefs.current.get(technicians[0]?.technician.id ?? "") ?? responsibilityRef,
          technicians[0]?.technician.id ?? null,
        );
      }
      const unjustified = affected.find(({ draft }) => !draft.justification.trim());
      if (unjustified) {
        return reject(
          "justification",
          `Justifica la afectación de ${unjustified.entry.technician.fullName}.`,
          justificationRefs.current.get(unjustified.entry.technician.id) ?? null,
          unjustified.entry.technician.id,
        );
      }
      const excessive = affected.find(({ draft }) => draft.justification.trim().length > 1_000);
      if (excessive) {
        return reject(
          "justification",
          `La justificación de ${excessive.entry.technician.fullName} no puede superar 1,000 caracteres.`,
          justificationRefs.current.get(excessive.entry.technician.id) ?? null,
          excessive.entry.technician.id,
        );
      }
    }

    const qualityDecisions = drafts.map(({ entry, draft }) => responsibility === "TECHNICAL_WORK" && draft.affectsQuality
      ? { technicianId: entry.technician.id, affectsQuality: true, justification: draft.justification.trim() }
      : { technicianId: entry.technician.id, affectsQuality: false });
    const input: AnalysisInput = {
      causeId,
      impact,
      responsibility,
      analysis: normalizedAnalysis,
      qualityDecisions,
      ...(normalizedCost ? { estimatedCost: normalizedCost, costReason: normalizedCostReason } : {}),
      ...(normalizedAgeReason ? { ageOverrideReason: normalizedAgeReason } : {}),
    };

    clearValidation();
    pendingRef.current = true;
    setPending(true);
    try {
      await onSubmit(input);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const errorId = validationError || apiError ? "recurrence-analysis-error" : undefined;
  const technical = responsibility === "TECHNICAL_WORK";

  return <form className="recurrence-analysis-form" role="dialog" aria-modal="true" aria-labelledby="recurrence-analysis-title" ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="recurrence-analysis-form__head">
      <div><p className="eyebrow">Decisión de calidad</p><h2 id="recurrence-analysis-title">Analizar caso</h2><span>Determina la causa, el impacto y la atribución del trabajo original.</span></div>
      <button className="icon-button" type="button" aria-label="Cerrar análisis" disabled={pending} onClick={onCancel}><X size={18} aria-hidden="true" /></button>
    </header>
    <fieldset className="recurrence-analysis-form__body" disabled={pending}>
      <legend className="sr-only">Datos del análisis</legend>
      <div className="recurrence-analysis-form__classification">
        <label><span>Causa</span><select ref={causeRef} name="causeId" autoComplete="off" aria-invalid={invalidField === "cause" || undefined} aria-describedby={invalidField === "cause" ? errorId : undefined} value={causeId} onChange={(event) => { setCauseId(event.target.value); clearValidation(); }}><option value="">Selecciona una causa</option>{catalog.causes.map((cause) => <option key={cause.id} value={cause.id}>{cause.name}</option>)}</select></label>
        <label><span>Impacto</span><select ref={impactRef} name="impact" autoComplete="off" aria-invalid={invalidField === "impact" || undefined} aria-describedby={invalidField === "impact" ? errorId : undefined} value={impact} onChange={(event) => { setImpact(event.target.value as RecurrenceImpact | ""); clearValidation(); }}><option value="">Selecciona el impacto</option>{catalog.impacts.map((item) => <option key={item} value={item}>{impactLabel[item]}</option>)}</select></label>
        <label><span>Responsabilidad</span><select ref={responsibilityRef} name="responsibility" autoComplete="off" aria-invalid={invalidField === "responsibility" || undefined} aria-describedby={invalidField === "responsibility" ? errorId : undefined} value={responsibility} onChange={(event) => selectResponsibility(event.target.value)}><option value="">Selecciona la responsabilidad</option>{catalog.responsibilities.filter((item): item is Responsibility => item !== "UNDETERMINED").map((item) => <option key={item} value={item}>{responsibilityLabel[item]}</option>)}</select></label>
      </div>
      <label className="recurrence-analysis-form__analysis"><span>Análisis técnico</span><textarea ref={analysisRef} name="analysis" rows={5} autoComplete="off" aria-invalid={invalidField === "analysis" || Boolean(apiError) || undefined} aria-describedby={invalidField === "analysis" || apiError ? errorId : undefined} value={analysis} onChange={(event) => { setAnalysis(event.target.value); clearValidation(); }} placeholder="Describe los hallazgos y cómo se relacionan con la reincidencia…" /></label>

      <section className="recurrence-analysis-form__quality" aria-labelledby="recurrence-analysis-quality-title">
        <div><span className="recurrence-analysis-form__label">Participación original</span><h3 id="recurrence-analysis-quality-title"><ClipboardCheck size={16} aria-hidden="true" />Decisiones de calidad</h3><p>{technical ? "Marca cada afectación y documenta el criterio." : "La calidad sólo se atribuye cuando la responsabilidad es trabajo técnico."}</p></div>
        {technicians.length === 0 ? <p className="recurrence-analysis-form__empty">No hay técnicos originales registrados.</p> : <ul>{technicians.map((entry) => {
          const id = entry.technician.id;
          const draft = decisions[id] ?? { affectsQuality: false, justification: "" };
          const justificationId = `recurrence-analysis-justification-${id}`;
          return <li key={id}>
            <label className="recurrence-analysis-form__decision"><input ref={(node) => { if (node) checkboxRefs.current.set(id, node); else checkboxRefs.current.delete(id); }} type="checkbox" name={`quality-${id}`} aria-label={`Afecta calidad de ${entry.technician.fullName}`} disabled={!technical} checked={technical && draft.affectsQuality} aria-invalid={invalidField === "quality" && invalidTechnicianId === id || undefined} aria-describedby={invalidField === "quality" && invalidTechnicianId === id ? errorId : undefined} onChange={(event) => setAffectsQuality(id, event.target.checked)} /><span><strong>Afecta calidad de {entry.technician.fullName}</strong><small>{entry.technician.code}</small></span></label>
            <label htmlFor={justificationId}><span>Justificación para {entry.technician.fullName}</span><textarea id={justificationId} ref={(node) => { if (node) justificationRefs.current.set(id, node); else justificationRefs.current.delete(id); }} name={`justification-${id}`} rows={3} autoComplete="off" disabled={!technical || !draft.affectsQuality} aria-invalid={invalidField === "justification" && invalidTechnicianId === id || undefined} aria-describedby={invalidField === "justification" && invalidTechnicianId === id ? errorId : undefined} value={technical && draft.affectsQuality ? draft.justification : ""} onChange={(event) => setJustification(id, event.target.value)} /></label>
          </li>;
        })}</ul>}
      </section>

      <section className="recurrence-analysis-form__documentation" aria-labelledby="recurrence-analysis-documentation-title">
        <div><span className="recurrence-analysis-form__label">Documentación complementaria</span><h3 id="recurrence-analysis-documentation-title">Costo y antigüedad</h3></div>
        <div className="recurrence-analysis-form__cost">
          <label><span>Costo estimado</span><input ref={costRef} name="estimatedCost" type="text" inputMode="decimal" autoComplete="off" aria-invalid={invalidField === "cost" || undefined} aria-describedby={invalidField === "cost" ? errorId : undefined} value={estimatedCost} onChange={(event) => { setEstimatedCost(event.target.value); clearValidation(); }} placeholder="0.00" /></label>
          <label><span>Razón del costo</span><textarea ref={costReasonRef} name="costReason" rows={2} autoComplete="off" aria-invalid={invalidField === "costReason" || undefined} aria-describedby={invalidField === "costReason" ? errorId : undefined} value={costReason} onChange={(event) => { setCostReason(event.target.value); clearValidation(); }} placeholder="Explica por qué cambia el costo…" /></label>
        </div>
        <label className="recurrence-analysis-form__age"><span>Motivo de antigüedad</span><textarea ref={ageRef} name="ageOverrideReason" rows={2} autoComplete="off" aria-label="Motivo de antigüedad" aria-invalid={invalidField === "age" || undefined} aria-describedby={invalidField === "age" ? errorId : undefined} value={ageOverrideReason} onChange={(event) => { setAgeOverrideReason(event.target.value); clearValidation(); }} placeholder="Completa este campo si el caso supera el plazo de advertencia…" /><small>Requerido por el servidor cuando la detección excede el plazo configurado.</small></label>
      </section>

      {(validationError || apiError) && <p className="recurrence-analysis-form__error" id={errorId} role="alert"><AlertTriangle size={16} aria-hidden="true" />{validationError ?? apiError}</p>}
    </fieldset>
    <footer className="recurrence-analysis-form__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar análisis"}</button></footer>
  </form>;
}
