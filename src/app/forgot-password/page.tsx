import { ForgotForm } from './forgot-form'

export default function ForgotPasswordPage() {
  return (
    <div className="app-canvas app-canvas--deep">
      <div className="auth-wrap">
        <div
          className="auth-decor dots float-b"
          style={{ width: 175, height: 155, bottom: '19%', left: '16%', transform: 'rotate(-5deg)' }}
          aria-hidden
        />
        <div
          className="auth-decor float-a"
          style={{ width: 120, height: 120, top: '18%', right: '18%', transform: 'rotate(8deg)', borderRadius: 99 }}
          aria-hidden
        />
        <ForgotForm />
      </div>
    </div>
  )
}
