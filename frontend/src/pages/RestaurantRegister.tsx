import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type Status = 'loading' | 'valid' | 'submitted' | 'invalid' | 'expired';

interface OnboardingData {
  restaurant_name: string;
  contact_person: string;
  email: string;
  trading_name: string;
  company_reg_no: string;
  vat_no: string;
  address: string;
  postcode: string;
  city: string;
  phone: string;
  opening_hours: string;
  delivery_instructions: string;
  preferred_delivery_days: string;
  preferred_delivery_time: string;
  accounts_email: string;
  payment_terms: string;
  po_required: boolean;
  password: string;
  confirm_password: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function RestaurantRegister() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [changesNote, setChangesNote] = useState('');
  const [ckName, setCkName] = useState('Central Kitchen');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<OnboardingData>({
    restaurant_name: '', contact_person: '', email: '',
    trading_name: '', company_reg_no: '', vat_no: '',
    address: '', postcode: '', city: '', phone: '',
    opening_hours: '', delivery_instructions: '',
    preferred_delivery_days: '', preferred_delivery_time: '',
    accounts_email: '', payment_terms: '',
    po_required: false, password: '', confirm_password: '',
  });

  const loadInvite = useCallback(async () => {
    if (!token) { setStatus('invalid'); return; }
    try {
      const { data } = await axios.get(`${API}/auth/onboarding/invite`, { params: { token } });
      const ob = data.onboarding;
      setCkName(ob.tenant?.name ?? 'Central Kitchen');
      if (ob.rejection_reason) setChangesNote(ob.rejection_reason);
      setForm(prev => ({
        ...prev,
        restaurant_name: ob.restaurant_name ?? '',
        contact_person: ob.contact_person ?? '',
        email: ob.email ?? '',
        trading_name: ob.trading_name ?? '',
        company_reg_no: ob.company_reg_no ?? '',
        vat_no: ob.vat_no ?? '',
        address: ob.address ?? '',
        postcode: ob.postcode ?? '',
        city: ob.city ?? '',
        phone: ob.phone ?? '',
        opening_hours: ob.opening_hours ?? '',
        delivery_instructions: ob.delivery_instructions ?? '',
        preferred_delivery_days: ob.preferred_delivery_days ?? '',
        preferred_delivery_time: ob.preferred_delivery_time ?? '',
        accounts_email: ob.accounts_email ?? '',
        payment_terms: ob.payment_terms ?? '',
        po_required: ob.po_required ?? false,
      }));
      setStatus('valid');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Invalid or expired link.';
      setErrorMsg(msg);
      setStatus('invalid');
    }
  }, [token]);

  useEffect(() => { loadInvite(); }, [loadInvite]);

  const set = (field: keyof OnboardingData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const toggleDay = (day: string) => {
    const days = form.preferred_delivery_days ? form.preferred_delivery_days.split(',').filter(Boolean) : [];
    const newDays = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    setForm(prev => ({ ...prev, preferred_delivery_days: newDays.join(',') }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm_password) { setErrorMsg('Passwords do not match.'); return; }
    if (form.password.length < 8) { setErrorMsg('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    setErrorMsg('');
    try {
      await axios.post(`${API}/auth/onboarding/submit`, { ...form, token });
      setStatus('submitted');
      setSuccessMsg('Your registration has been submitted successfully! The Central Kitchen team will review it shortly.');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="ob-shell">
        <div className="ob-loader">
          <div className="ob-spinner" />
          <p>Loading your invitation...</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="ob-shell">
        <div className="ob-card ob-card--center">
          <div className="ob-icon-err">✕</div>
          <h2>Invalid Link</h2>
          <p>{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (status === 'submitted') {
    return (
      <div className="ob-shell">
        <div className="ob-card ob-card--center">
          <div className="ob-icon-ok">✓</div>
          <h2>Registration Submitted!</h2>
          <p>{successMsg}</p>
          <div className="ob-status-badge ob-status-badge--pending">⏳ Pending Approval</div>
        </div>
      </div>
    );
  }

  const selectedDays = form.preferred_delivery_days ? form.preferred_delivery_days.split(',').filter(Boolean) : [];

  return (
    <div className="ob-shell">
      <header className="ob-header">
        <div className="ob-header-brand"><img src="/Qken_logo.svg" alt="Qken" className="login-logo-img" /></div>
        <h1 className="ob-header-title">Restaurant Registration</h1>
        <p className="ob-header-sub">Complete your details below to join the ordering platform</p>
      </header>

      {changesNote && (
        <div className="ob-changes-note">
          <strong>📝 Changes Requested:</strong>
          <p>{changesNote}</p>
        </div>
      )}

      {errorMsg && <div className="ob-alert ob-alert--error">{errorMsg}</div>}

      <form className="ob-form" onSubmit={handleSubmit} noValidate>

        {/* ── Section 1: Restaurant Details ── */}
        <div className="ob-section">
          <h3 className="ob-section-title">Restaurant Details</h3>
          <div className="ob-grid ob-grid--2">
            <div className="ob-field">
              <label>Restaurant Name *</label>
              <input value={form.restaurant_name} onChange={set('restaurant_name')} required placeholder="ABC Restaurant" />
            </div>
            <div className="ob-field">
              <label>Trading Name</label>
              <input value={form.trading_name} onChange={set('trading_name')} placeholder="If different from above" />
            </div>
            <div className="ob-field">
              <label>Company Registration No.</label>
              <input value={form.company_reg_no} onChange={set('company_reg_no')} placeholder="e.g. 12345678" />
            </div>
            <div className="ob-field">
              <label>VAT Number</label>
              <input value={form.vat_no} onChange={set('vat_no')} placeholder="e.g. GB123456789" />
            </div>
          </div>
          <div className="ob-field ob-field--full">
            <label>Address *</label>
            <textarea value={form.address} onChange={set('address')} required rows={2} placeholder="Street address" />
          </div>
          <div className="ob-grid ob-grid--2">
            <div className="ob-field">
              <label>Postcode *</label>
              <input value={form.postcode} onChange={set('postcode')} required placeholder="e.g. EC1A 1BB" />
            </div>
            <div className="ob-field">
              <label>City *</label>
              <input value={form.city} onChange={set('city')} required placeholder="London" />
            </div>
          </div>
        </div>

        {/* ── Section 2: Contact ── */}
        <div className="ob-section">
          <h3 className="ob-section-title">Contact Information</h3>
          <div className="ob-grid ob-grid--2">
            <div className="ob-field">
              <label>Contact Person *</label>
              <input value={form.contact_person} onChange={set('contact_person')} required />
            </div>
            <div className="ob-field">
              <label>Phone *</label>
              <input type="tel" value={form.phone} onChange={set('phone')} required placeholder="+44 7700 900000" />
            </div>
            <div className="ob-field ob-field--full">
              <label>Email *</label>
              <input type="email" value={form.email} onChange={set('email')} required />
            </div>
          </div>
        </div>

        {/* ── Section 3: Business Details ── */}
        <div className="ob-section">
          <h3 className="ob-section-title">Business Details</h3>
          <div className="ob-field ob-field--full">
            <label>Opening Hours</label>
            <input value={form.opening_hours} onChange={set('opening_hours')} placeholder="e.g. Mon–Fri 8am–10pm" />
          </div>
          <div className="ob-field ob-field--full">
            <label>Delivery Instructions</label>
            <textarea value={form.delivery_instructions} onChange={set('delivery_instructions')} rows={2} placeholder="Any special delivery notes" />
          </div>
          <div className="ob-field ob-field--full">
            <label>Preferred Delivery Days</label>
            <div className="ob-day-picker">
              {DAYS.map(d => (
                <button type="button" key={d}
                  className={`ob-day-btn ${selectedDays.includes(d) ? 'ob-day-btn--on' : ''}`}
                  onClick={() => toggleDay(d)}>{d}</button>
              ))}
            </div>
          </div>
          <div className="ob-field">
            <label>Preferred Delivery Time</label>
            <input value={form.preferred_delivery_time} onChange={set('preferred_delivery_time')} placeholder="e.g. Before 10am" />
          </div>
        </div>

        {/* ── Section 4: Billing ── */}
        <div className="ob-section">
          <h3 className="ob-section-title">Billing Information</h3>
          <div className="ob-grid ob-grid--2">
            <div className="ob-field">
              <label>Accounts Email</label>
              <input type="email" value={form.accounts_email} onChange={set('accounts_email')} placeholder="accounts@restaurant.com" />
            </div>
            <div className="ob-field">
              <label>Payment Terms</label>
              <input value={form.payment_terms} onChange={set('payment_terms')} placeholder="e.g. Net 30" />
            </div>
          </div>
          <div className="ob-field">
            <label>Purchase Order Required?</label>
            <select value={form.po_required ? 'yes' : 'no'} onChange={e => setForm(prev => ({ ...prev, po_required: e.target.value === 'yes' }))}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>

        {/* ── Section 5: Login ── */}
        <div className="ob-section">
          <h3 className="ob-section-title">Create Login</h3>
          <div className="ob-grid ob-grid--2">
            <div className="ob-field">
              <label>Password *</label>
              <input type="password" value={form.password} onChange={set('password')} required placeholder="Min. 8 characters" autoComplete="new-password" />
            </div>
            <div className="ob-field">
              <label>Confirm Password *</label>
              <input type="password" value={form.confirm_password} onChange={set('confirm_password')} required autoComplete="new-password" />
            </div>
          </div>
        </div>

        <button className="ob-submit-btn" type="submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Registration →'}
        </button>

      </form>
    </div>
  );
}
