import React, { useState } from 'react'
import Sidebar from './components/layout/Sidebar.jsx'
import Overview from './components/overview/Overview.jsx'
import RecruitmentPipeline from './components/recruitment/RecruitmentPipeline.jsx'
import DealPipeline from './components/deals/DealPipeline.jsx'
import DocumentManager from './components/documents/DocumentManager.jsx'
import CandidateDatabase from './components/candidates/CandidateDatabase.jsx'
import JobListings from './components/jobs/JobListings.jsx'
import Performance from './components/performance/Performance.jsx'
import Reports from './components/reports/Reports.jsx'
import Integrations from './components/settings/Integrations.jsx'
import Settings from './components/settings/Settings.jsx'

const SECTIONS = {
  overview: Overview,
  pipeline: RecruitmentPipeline,
  candidates: CandidateDatabase,
  jobs: JobListings,
  deals: DealPipeline,
  documents: DocumentManager,
  'recruiter-performance': () => <Performance defaultTab="recruiters" />,
  'sales-performance': () => <Performance defaultTab="sales" />,
  reports: Reports,
  integrations: Integrations,
  settings: Settings,
}

export default function App() {
  const [activeSection, setActiveSection] = useState('overview')

  const SectionComponent = SECTIONS[activeSection] || Overview

  return (
    <div className="app-layout">
      <Sidebar activeSection={activeSection} onNavigate={setActiveSection} />
      <main className="main-content">
        <SectionComponent />
      </main>
    </div>
  )
}
