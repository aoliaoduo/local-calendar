import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import '@fontsource/material-icons'
import './styles/base.css'
import './styles/views.css'
import App from './App'

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="runtime-fallback">
        <span className="material-icons">error_outline</span>
        <h1>页面加载失败</h1>
        <p>{this.state.error.message || '应用遇到未预期错误'}</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
      </div>
    )
  }
}

function RuntimeFallback() {
  return (
    <div className="runtime-fallback">
      <span className="material-icons">desktop_windows</span>
      <h1>请从本地日历应用启动</h1>
      <p>当前页面没有可用的 Electron 应用桥接，直接打开开发地址无法加载日历数据。</p>
    </div>
  )
}

const hasElectronBridge = typeof window !== 'undefined'
  && typeof window.calendarApi?.call === 'function'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {hasElectronBridge ? <ErrorBoundary><App /></ErrorBoundary> : <RuntimeFallback />}
  </React.StrictMode>
)
