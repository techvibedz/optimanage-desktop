import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import UpdateModal from './UpdateModal'

export default function AppLayout() {
  return (
    <div className="app-layout">
      <div className="app-sidebar">
        <Sidebar />
      </div>
      <main className="app-content">
        <Outlet />
      </main>
      <UpdateModal />
    </div>
  )
}
