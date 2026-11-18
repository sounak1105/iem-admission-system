import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Application, type Course } from '../api';
import { Alert, Field, Shell, StatusBadge, btnGhost, btnPrimary, inputCls } from '../ui';

const DOC_LABELS = ['Mark sheet', 'ID Proof', 'Photo'];
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function ApplicationForm() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ course: '', campus: '', qualification: '', marks: '' });

  useEffect(() => {
    Promise.all([api<Course[]>('/courses'), api<Application | null>('/applications/mine')])
      .then(([c, a]) => { setCourses(c); setApp(a); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const course = courses.find((c) => c.name === form.course);
  const marksNum = Number(form.marks);
  const marksEntered = form.marks.trim() !== '';
  // Marks are a percentage: only 0 to 100 is valid (the server enforces the same rule)
  const marksValid = marksEntered && Number.isFinite(marksNum) && marksNum >= 0 && marksNum <= 100;
  const marksError = marksEntered && !marksValid ? 'Enter marks between 0 and 100' : '';
  const eligible = !!course && marksValid && marksNum >= course.minPercent;

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setError('');
    try { return await fn(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function createApplication(e: FormEvent) {
    e.preventDefault();
    const a = await run(() => api<Application>('/applications', 'POST', form));
    if (a) setApp(a);
  }

  async function uploadDoc(label: string, file: File | undefined) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) { setError('Only JPEG, PNG or PDF files are allowed'); return; }
    if (file.size > MAX_BYTES) { setError('File is larger than 5 MB'); return; }
    const fd = new FormData();
    fd.append('label', label);
    fd.append('file', file);
    const a = await run(() => api<Application>('/applications/documents', 'POST', fd));
    if (a) setApp(a);
  }

  async function pay() {
    const a = await run(() => api<Application>('/applications/pay', 'POST', { type: 'Application' }));
    if (a) setApp(a);
  }

  async function submit() {
    const a = await run(() => api<Application>('/applications/submit', 'POST'));
    if (a) { setApp(a); navigate('/dashboard'); }
  }

  if (loading) return <Shell title="Application"><p className="text-sm text-gray-500">Loading…</p></Shell>;

  // Step 1: no application yet
  if (!app) {
    return (
      <Shell title="Application Form">
        <form onSubmit={createApplication} className="space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Course">
            <select required value={form.course} className={inputCls}
              onChange={(e) => setForm({ ...form, course: e.target.value, campus: '' })}>
              <option value="">Select a course</option>
              {courses.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Campus">
            <select required value={form.campus} disabled={!course} className={inputCls}
              onChange={(e) => setForm({ ...form, campus: e.target.value })}>
              <option value="">Select a campus</option>
              {course?.campuses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Qualification (e.g. Class XII, Science)">
            <input required value={form.qualification} className={inputCls}
              onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
          </Field>
          <Field label="Marks (%)" error={marksError}>
            <input required type="number" min={0} max={100} step="0.01" value={form.marks}
              aria-invalid={!!marksError}
              className={`${inputCls} ${marksError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
              onChange={(e) => setForm({ ...form, marks: e.target.value })} />
          </Field>
          {course && marksValid && (
            eligible
              ? <Alert kind="success">Eligible for {course.name} (minimum {course.minPercent}%).</Alert>
              : <Alert kind="error">Not eligible: {course.name} requires at least {course.minPercent}%.</Alert>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={busy || !eligible} className={btnPrimary}>Create application</button>
            <Link to="/dashboard" className={btnGhost}>Back</Link>
          </div>
        </form>
      </Shell>
    );
  }

  // Step 2: documents, fee, submit
  const draft = app.status === 'Submitted';
  const appPaid = app.payments.some((p) => p.type === 'Application' && p.status === 'Success');
  const allUploaded = DOC_LABELS.every((l) => app.docs.some((d) => d.label === l));

  return (
    <Shell title="Application Form & Documents">
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 font-mono">{app.appId}</p>
          <p className="text-sm font-semibold text-gray-800">{app.course} — {app.campus}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-800">Documents (JPEG, PNG or PDF, up to 5 MB)</p>
        {DOC_LABELS.map((label) => {
          const doc = app.docs.find((d) => d.label === label);
          const canUpload = draft || (app.status === 'Under Review' && doc?.status === 'Rejected');
          return (
            <div key={label} className="border border-gray-200 rounded-sm px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {label}{' '}
                  {doc ? <StatusBadge status={doc.status} /> : <span className="text-xs text-amber-600">Not uploaded</span>}
                  {doc && doc.reuploads > 0 && <span className="ml-2 text-xs text-gray-400">re-uploaded {doc.reuploads}×</span>}
                </span>
                {canUpload && (
                  <input type="file" accept=".jpg,.jpeg,.png,.pdf" disabled={busy} className="text-xs"
                    onChange={(e) => { uploadDoc(label, e.target.files?.[0]); e.target.value = ''; }} />
                )}
              </div>
              {doc?.originalName && <p className="text-xs text-gray-400 mt-1">{doc.originalName}</p>}
              {doc?.status === 'Rejected' && (
                <p className="text-xs text-red-600 mt-1">
                  Rejected: {doc.reason}{canUpload && ' — choose a corrected file to re-upload.'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {draft ? (
        <>
          <div className="border border-gray-200 rounded-sm px-3 py-3 text-sm flex items-center justify-between">
            <span>Application fee: ₹500 {appPaid && <span className="text-green-600 font-medium">· Paid ✓</span>}</span>
            {!appPaid && <button onClick={pay} disabled={busy} className={btnPrimary}>Pay (sandbox)</button>}
          </div>
          <div className="flex gap-3">
            <button onClick={submit} disabled={busy || !allUploaded || !appPaid} className={btnPrimary}>
              Submit application
            </button>
            <Link to="/dashboard" className={btnGhost}>Save and go back</Link>
          </div>
          {(!allUploaded || !appPaid) && (
            <p className="text-xs text-gray-400">Upload all three documents and pay the fee to enable submission.</p>
          )}
        </>
      ) : (
        <Link to="/dashboard" className={`${btnGhost} inline-block`}>Back to dashboard</Link>
      )}
    </Shell>
  );
}
