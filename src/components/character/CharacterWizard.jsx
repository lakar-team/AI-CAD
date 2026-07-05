import { HelpCircle, X, CheckCircle2, Circle } from 'lucide-react';

const VTUBE_URL = 'https://vtubemaker.pages.dev';

function WizBtn({ children, onClick, variant, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4,
        border: variant === 'primary' ? 'none' : '1px solid var(--sk-tray-border)',
        background: variant === 'primary' ? 'var(--sk-accent)' : '#fff',
        color: variant === 'primary' ? '#fff' : 'var(--sk-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function WizChecklistRow({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function WizAutoCheckRow({ label, checked }) {
  const Icon = checked ? CheckCircle2 : Circle;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0',
      color: checked ? 'var(--sk-text)' : 'var(--sk-text-muted)',
    }}>
      <Icon size={13} color={checked ? '#22cc55' : 'var(--sk-text-light)'} />
      {label}
    </div>
  );
}

function WizardCard({ title, stepLabel, onClose, children }) {
  return (
    <div
      style={{
        margin: '8px', padding: '10px 12px', borderRadius: 6,
        border: '1px solid var(--sk-accent)', background: '#eef8ff',
        boxShadow: '0 2px 8px rgba(26,159,220,0.18)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sk-accent)' }}>{title}</span>
          {stepLabel && <span style={{ fontSize: 10, color: 'var(--sk-text-muted)' }}>{stepLabel}</span>}
        </div>
        <button
          onClick={onClose}
          title="Close wizard"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sk-text-muted)', display: 'flex' }}
        >
          <X size={13} />
        </button>
      </div>
      {children}
    </div>
  );
}

// ─── Step 0 (welcome) ─────────────────────────────────────────────────────────

function WelcomeCard({ wizard }) {
  return (
    <WizardCard title="Model loaded — set it up for vtube" onClose={wizard.dismiss}>
      <div style={{ fontSize: 11, color: 'var(--sk-text)', lineHeight: 1.5, marginBottom: 8 }}>
        The setup guide walks you through bone review, prep tools, and export in about 2 minutes.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <WizBtn variant="primary" onClick={wizard.startGuide}>Start guide →</WizBtn>
        <WizBtn onClick={wizard.dismiss}>Skip</WizBtn>
      </div>
    </WizardCard>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ wizard }) {
  const { bonesGreenOk, bonesGreyOk } = wizard.checklist;
  return (
    <WizardCard title="Check bone detection" stepLabel="Step 1 of 5" onClose={wizard.dismiss}>
      <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>
        Bones have been auto-detected and colour-coded. Green = driven by mocap, yellow = spring physics, grey = locked/ignored.
      </div>
      <WizChecklistRow
        label="Arms, legs, spine, neck are green"
        checked={bonesGreenOk}
        onChange={(e) => wizard.setChecklist({ bonesGreenOk: e.target.checked })}
      />
      <WizChecklistRow
        label="Hair, clothes, accessories are yellow or grey"
        checked={bonesGreyOk}
        onChange={(e) => wizard.setChecklist({ bonesGreyOk: e.target.checked })}
      />
      <div style={{ fontSize: 10, color: 'var(--sk-text-muted)', margin: '6px 0', fontStyle: 'italic' }}>
        If a body part is grey, click it and set role to Driven. If hair/cloth is green, set it to Spring or Locked.
      </div>
      <WizBtn variant="primary" onClick={() => wizard.goToStep(2)}>Looks good</WizBtn>
    </WizardCard>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function Step2({ wizard }) {
  const { lrChoice } = wizard.checklist;
  return (
    <WizardCard title="Left/right check" stepLabel="Step 2 of 5" onClose={wizard.dismiss}>
      <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>
        Does the Bone Rig panel show L/R assignments correctly? Left shoulder should say &lsquo;shL → elL&rsquo;, right shoulder &lsquo;shR → elR&rsquo;.
      </div>
      {lrChoice !== 'swapped' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <WizBtn variant="primary" onClick={() => wizard.goToStep(3)}>✓ Assignments look correct</WizBtn>
          <WizBtn onClick={() => wizard.setLrChoice('swapped')}>✗ They look swapped</WizBtn>
        </div>
      )}
      {lrChoice === 'swapped' && (
        <>
          <div style={{ fontSize: 10, color: 'var(--sk-text-muted)', marginBottom: 6, fontStyle: 'italic' }}>
            Click <strong>Swap L/R</strong> in the Bone Rig panel. Then come back and confirm.
          </div>
          <WizBtn variant="primary" onClick={() => wizard.goToStep(3)}>Confirmed</WizBtn>
        </>
      )}
    </WizardCard>
  );
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

const PREP_STEPS = [
  { key: 'prepTpose', label: 'Normalize T-Pose — click this first' },
  { key: 'prepScale', label: 'Auto Scale — scales to correct height' },
  { key: 'prepGround', label: 'Ground Model — feet at ground level' },
  { key: 'prepFacing', label: 'Fix Facing — click until the model faces you' },
];

function Step3({ wizard }) {
  return (
    <WizardCard title="Prepare the model" stepLabel="Step 3 of 5" onClose={wizard.dismiss}>
      <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>
        Run these in order — each button becomes available after the previous step.
      </div>
      {PREP_STEPS.slice(0, 3).map((s) => (
        <WizAutoCheckRow key={s.key} label={s.label} checked={wizard.checklist[s.key]} />
      ))}
      <WizChecklistRow
        label="Model is facing me"
        checked={wizard.checklist.prepFacing}
        onChange={(e) => wizard.setChecklist({ prepFacing: e.target.checked })}
      />
    </WizardCard>
  );
}

// ─── Step 4 ───────────────────────────────────────────────────────────────────

function Step4({ wizard }) {
  return (
    <WizardCard title="Export for vtube" stepLabel="Step 4 of 5" onClose={wizard.dismiss}>
      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
        Click Export GLB. The driving recipe bakes into the file automatically. Once downloaded, load it in vtube.
      </div>
    </WizardCard>
  );
}

// ─── Step 5 ───────────────────────────────────────────────────────────────────

function Step5({ wizard }) {
  return (
    <WizardCard title="Ready for vtube" stepLabel="Step 5 of 5" onClose={wizard.dismiss}>
      <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
        Your model is exported. Load it in vtube at vtubemaker.pages.dev — the setup wizard there will guide you through the rest.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <WizBtn
          variant="primary"
          onClick={() => window.open(VTUBE_URL, '_blank', 'noopener,noreferrer')}
        >
          Open vtube →
        </WizBtn>
        <WizBtn onClick={wizard.dismiss}>Got it</WizBtn>
      </div>
    </WizardCard>
  );
}

// ─── Reopen chip ("?" button) ─────────────────────────────────────────────────

function ReopenChip({ wizard }) {
  return (
    <button
      onClick={wizard.reopen}
      title="Reopen the setup guide"
      style={{
        position: 'fixed', top: 'calc(var(--topbar-height) + 8px)', right: 8, zIndex: 150,
        width: 26, height: 26, borderRadius: '50%', border: 'none',
        background: 'var(--sk-accent)', color: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      }}
    >
      <HelpCircle size={14} />
    </button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function CharacterWizard({ characterEngine }) {
  const { wizard, selectedChar } = characterEngine;

  if (wizard.step === 0) {
    return selectedChar ? <ReopenChip wizard={wizard} /> : null;
  }
  if (wizard.step === 'welcome') return <WelcomeCard wizard={wizard} />;
  if (wizard.step === 1) return <Step1 wizard={wizard} />;
  if (wizard.step === 2) return <Step2 wizard={wizard} />;
  if (wizard.step === 3) return <Step3 wizard={wizard} />;
  if (wizard.step === 4) return <Step4 wizard={wizard} />;
  if (wizard.step === 5) return <Step5 wizard={wizard} />;
  return null;
}
