import React, { useEffect, useState } from 'react';
import AnnouncementsSection from './social/AnnouncementsSection.jsx';
import DmConversation from './social/DmConversation.jsx';
import FriendsSection from './social/FriendsSection.jsx';

export default function SocialTab({
  currentUser,
  currentUserName,
  currentUserPhotoURL,
  onPlayerClick,
  pendingDm,
  onPendingDmHandled,
  onChallengeFriend,
}) {
  const [activeDm, setActiveDm] = useState(null);
  const [subTab, setSubTab] = useState('lobby');

  useEffect(() => {
    if (!pendingDm) return;
    setActiveDm(pendingDm);
    setSubTab('friends');
    onPendingDmHandled?.();
  }, [pendingDm, onPendingDmHandled]);

  return (
    <div className="tab-panel social-tab">
      {activeDm ? (
        <DmConversation
          chatId={activeDm.chatId}
          partnerUid={activeDm.partnerUid}
          partnerName={activeDm.partnerName}
          currentUser={currentUser}
          currentUserName={currentUserName}
          onBack={() => setActiveDm(null)}
        />
      ) : (
        <>
          <div className="social-subtabs">
            <button
              className={`social-subtab-btn${subTab === 'lobby' ? ' active' : ''}`}
              onClick={() => setSubTab('lobby')}
            >
              Lobby
            </button>
            <button
              className={`social-subtab-btn${subTab === 'friends' ? ' active' : ''}`}
              onClick={() => setSubTab('friends')}
            >
              Friends
            </button>
          </div>
          {subTab === 'lobby' && (
            <AnnouncementsSection
              currentUser={currentUser}
              currentUserName={currentUserName}
              currentUserPhotoURL={currentUserPhotoURL}
            />
          )}
          {subTab === 'friends' && (
            <FriendsSection
              currentUser={currentUser}
              onOpenDm={setActiveDm}
              onPlayerClick={onPlayerClick}
              onChallengeFriend={onChallengeFriend}
            />
          )}
        </>
      )}
    </div>
  );
}
