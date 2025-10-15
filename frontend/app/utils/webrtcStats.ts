export interface ConnectionStats {
  connectionType: "DIRECT" | "TURN" | "LOCAL" | "UNKNOWN";
  localCandidate: string;
  remoteCandidate: string;
  candidatePair: any;
  rtt?: number;
  bytesReceived?: number;
  bytesSent?: number;
  packetsReceived?: number;
  packetsSent?: number;
  packetsLost?: number;
  jitter?: number;
}

export interface CandidatePairInfo {
  pair: any;
  bytes: number;
  nominated: boolean;
  selected: boolean;
}

export interface BestCandidatePair {
  nominated: any;
  selected: any;
  active: any;
  maxBytes: number;
}

export function isLocalAddress(address: string): boolean {
  if (!address) return false;

  if (address.endsWith(".local")) return true;

  if (address.startsWith("192.168.")) return true;
  if (address.startsWith("10.")) return true;
  if (address.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true;

  if (address.startsWith("127.")) return true;
  if (address === "::1" || address === "localhost") return true;

  if (address.startsWith("169.254.")) return true;
  if (address.startsWith("fe80:")) return true;

  return false;
}

export function findBestCandidatePair(stats: RTCStatsReport): BestCandidatePair {
  const pairs: CandidatePairInfo[] = [];

  stats.forEach((stat: any) => {
    if (stat.type === "candidate-pair" && stat.state === "succeeded") {
      const totalBytes = (stat.bytesReceived || 0) + (stat.bytesSent || 0);
      pairs.push({
        pair: stat,
        bytes: totalBytes,
        nominated: stat.nominated || false,
        selected: stat.selected || false,
      });
    }
  });

  pairs.sort((a, b) => {
    if (a.bytes > 0 && b.bytes === 0) return -1;
    if (b.bytes > 0 && a.bytes === 0) return 1;
    if (a.bytes !== b.bytes) return b.bytes - a.bytes;
    if (a.nominated !== b.nominated) return a.nominated ? -1 : 1;
    if (a.selected !== b.selected) return a.selected ? -1 : 1;
    return 0;
  });

  const best = pairs[0];
  const nominated = pairs.find(p => p.nominated);
  const selected = pairs.find(p => p.selected);

  return {
    nominated: nominated?.pair || null,
    selected: selected?.pair || null,
    active: best?.pair || null,
    maxBytes: best?.bytes || 0,
  };
}

export function determineConnectionType(
  localCandidate: any,
  remoteCandidate: any
): "DIRECT" | "TURN" | "LOCAL" | "UNKNOWN" {
  if (!localCandidate || !remoteCandidate) return "UNKNOWN";

  const localType = localCandidate.candidateType;
  const remoteType = remoteCandidate.candidateType;
  const localIP = localCandidate.address || localCandidate.ip;
  const remoteIP = remoteCandidate.address || remoteCandidate.ip;

  if (localType === "relay" || remoteType === "relay") {
    return "TURN";
  }
  
  if (isLocalAddress(localIP) && isLocalAddress(remoteIP)) {
    return "LOCAL";
  }
  
  if (localType === "srflx" || remoteType === "srflx" || localType === "prflx" || remoteType === "prflx") {
    return "DIRECT";
  }
  
  if (localType === "host" && remoteType === "host") {
    return "DIRECT";
  }

  return "UNKNOWN";
}

export function extractJitterFromStats(stats: RTCStatsReport): number | undefined {
  let jitter: number | undefined;
  
  stats.forEach((stat: any) => {
    if (stat.type === "inbound-rtp" && stat.jitter !== undefined) {
      jitter = stat.jitter;
    }
  });
  
  return jitter;
}

export function getCandidatesFromPair(
  stats: RTCStatsReport,
  candidatePair: any
): { localCandidate: any; remoteCandidate: any } {
  if (!candidatePair) {
    return { localCandidate: null, remoteCandidate: null };
  }

  const localCandidate = stats.get(candidatePair.localCandidateId);
  const remoteCandidate = stats.get(candidatePair.remoteCandidateId);

  return { localCandidate, remoteCandidate };
}

export function formatCandidateString(candidate: any): string {
  if (!candidate) return "Unknown";
  
  const type = candidate.candidateType || "unknown";
  const ip = candidate.address || candidate.ip || "unknown";
  const port = candidate.port || "unknown";
  
  return `${type}:${ip}:${port}`;
}

export function createConnectionStats(
  connectionType: "DIRECT" | "TURN" | "LOCAL" | "UNKNOWN",
  localCandidate: any,
  remoteCandidate: any,
  candidatePair: any,
  jitter?: number
): ConnectionStats {
  return {
    connectionType,
    localCandidate: formatCandidateString(localCandidate),
    remoteCandidate: formatCandidateString(remoteCandidate),
    candidatePair,
    rtt: candidatePair?.currentRoundTripTime,
    bytesReceived: candidatePair?.bytesReceived,
    bytesSent: candidatePair?.bytesSent,
    packetsReceived: candidatePair?.packetsReceived,
    packetsSent: candidatePair?.packetsSent,
    packetsLost: candidatePair?.packetsLost,
    jitter,
  };
}

export function createUnknownStats(status: string): ConnectionStats {
  return {
    connectionType: "UNKNOWN",
    localCandidate: status,
    remoteCandidate: status,
    candidatePair: null,
  };
}

export function isConnectionReady(pc: RTCPeerConnection): boolean {
  return (
    pc.connectionState === "connected" ||
    pc.iceConnectionState === "connected" ||
    pc.iceConnectionState === "completed"
  );
}

export async function getStatsWithRetry(
  pc: RTCPeerConnection,
  onWait?: () => void,
  onAfterWait?: (maxBytes: number, nominated: boolean, selected: boolean) => void
): Promise<{ stats: RTCStatsReport; candidatePair: any }> {
  let stats = await pc.getStats();
  let pairs = findBestCandidatePair(stats);

  if (!pairs.nominated && !pairs.selected && pairs.maxBytes === 0) {
    onWait?.();
    await new Promise(resolve => setTimeout(resolve, 200));
    stats = await pc.getStats();
    pairs = findBestCandidatePair(stats);
    onAfterWait?.(pairs.maxBytes, !!pairs.nominated, !!pairs.selected);
  }

  return { stats, candidatePair: pairs.active };
}

