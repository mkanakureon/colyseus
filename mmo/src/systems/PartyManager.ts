export interface Party {
  id: string;
  leaderId: string;
  members: string[]; // userIds
}

export interface PartyInvite {
  partyId: string;
  fromUserId: string;
  fromName: string;
}

export class PartyManager {
  private parties = new Map<string, Party>();
  private playerParty = new Map<string, string>(); // userId -> partyId
  private pendingInvites = new Map<string, PartyInvite>(); // targetUserId -> invite
  private idCounter = 0;

  /** Invite a player. Creates party if inviter has none. */
  invite(inviterUserId: string, inviterName: string, targetUserId: string): { success: boolean; error?: string; partyId?: string } {
    if (inviterUserId === targetUserId) {
      return { success: false, error: "CANNOT_INVITE_SELF" };
    }

    if (this.playerParty.has(targetUserId)) {
      return { success: false, error: "TARGET_IN_PARTY" };
    }

    // Create party if inviter doesn't have one
    let partyId = this.playerParty.get(inviterUserId);
    if (!partyId) {
      partyId = `party-${++this.idCounter}`;
      this.parties.set(partyId, { id: partyId, leaderId: inviterUserId, members: [inviterUserId] });
      this.playerParty.set(inviterUserId, partyId);
    }

    const party = this.parties.get(partyId)!;
    if (party.members.length >= 4) {
      return { success: false, error: "PARTY_FULL" };
    }

    this.pendingInvites.set(targetUserId, { partyId, fromUserId: inviterUserId, fromName: inviterName });
    return { success: true, partyId };
  }

  /** Respond to invite */
  respond(targetUserId: string, accept: boolean): { success: boolean; error?: string; party?: Party } {
    const invite = this.pendingInvites.get(targetUserId);
    if (!invite) {
      return { success: false, error: "NO_PENDING_INVITE" };
    }

    this.pendingInvites.delete(targetUserId);

    if (!accept) {
      return { success: true };
    }

    const party = this.parties.get(invite.partyId);
    if (!party) {
      return { success: false, error: "PARTY_NOT_FOUND" };
    }

    party.members.push(targetUserId);
    this.playerParty.set(targetUserId, party.id);
    return { success: true, party };
  }

  /** Leave party */
  leave(userId: string): { success: boolean; disbanded?: boolean } {
    const partyId = this.playerParty.get(userId);
    if (!partyId) return { success: false };

    const party = this.parties.get(partyId);
    if (!party) return { success: false };

    party.members = party.members.filter(m => m !== userId);
    this.playerParty.delete(userId);

    if (party.members.length === 0) {
      this.parties.delete(partyId);
      return { success: true, disbanded: true };
    }

    // Transfer leadership if leader left
    if (party.leaderId === userId) {
      party.leaderId = party.members[0];
    }

    return { success: true, disbanded: false };
  }

  /** Get party for a player */
  getParty(userId: string): Party | null {
    const partyId = this.playerParty.get(userId);
    if (!partyId) return null;
    return this.parties.get(partyId) || null;
  }

  /** Get party members (for battle room creation) */
  getMembers(userId: string): string[] {
    const party = this.getParty(userId);
    return party ? [...party.members] : [userId];
  }

  clear(): void {
    this.parties.clear();
    this.playerParty.clear();
    this.pendingInvites.clear();
  }
}
