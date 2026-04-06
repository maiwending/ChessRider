import React, { Suspense, lazy } from 'react';
import BoardShell from './BoardShell.jsx';
import GameSidebar from './GameSidebar.jsx';
import HomePage from './HomePage.jsx';

const LearnPage = lazy(() => import('./LearnPage.jsx'));
const SignInPage = lazy(() => import('./SignInPage.jsx'));

const pageFallback = (
  <div className="page-loading">
    <p className="muted">Loading page...</p>
  </div>
);

export default function AppPageRouter({
  currentPage,
  onNavigate,
  homePageProps,
  signInPageProps,
  boardShellProps,
  sidebarProps,
}) {
  if (currentPage === 'signin') {
    return (
      <Suspense fallback={pageFallback}>
        <SignInPage {...signInPageProps} onBack={() => onNavigate('home')} />
      </Suspense>
    );
  }

  if (currentPage === 'learn') {
    return (
      <Suspense fallback={pageFallback}>
        <LearnPage onBack={() => onNavigate('home')} onOpenTutorials={() => onNavigate('tutorials')} />
      </Suspense>
    );
  }

  if (currentPage === 'tutorials') {
    return (
      <Suspense fallback={pageFallback}>
        <LearnPage onBack={() => onNavigate('learn')} tutorialsOnly />
      </Suspense>
    );
  }

  if (currentPage === 'home') {
    return <HomePage {...homePageProps} />;
  }

  return (
    <>
      <main className="layout">
        <BoardShell {...boardShellProps} />
        <GameSidebar {...sidebarProps} currentPage={currentPage} onOpenLearn={() => onNavigate('learn')} />
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <span className="footer-brand-dot" />
          Knight-Aura Chess
        </div>
        <span className="footer-meta">Chess reimagined — unleash the power of the horse</span>
      </footer>
    </>
  );
}
