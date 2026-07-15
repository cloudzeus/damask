import { RegisterForm } from './register-form'

export default function RegisterPage() {
  return (
    <div className="app-canvas app-canvas--deep">
      <div className="auth-wrap">
        <div
          className="auth-decor dots float-a"
          style={{ width: 195, height: 124, top: '11%', right: '15%', transform: 'rotate(5deg)' }}
          aria-hidden
        />
        <div
          className="auth-decor float-b"
          style={{ width: 130, height: 160, bottom: '12%', left: '14%', transform: 'rotate(-6deg)' }}
          aria-hidden
        />
        <RegisterForm />
      </div>
    </div>
  )
}
