import { Component } from "react";
import type { ReactNode } from "react";

export default class PlaybackBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="playback is-active" role="alert"><span>지도를 준비하지 못했습니다.</span><button onClick={() => window.location.reload()}>새로고침</button></section>;
  }
}
