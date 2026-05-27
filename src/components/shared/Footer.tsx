import MicMark from './MicMark'

export default function Footer() {
  return (
    <footer className="bg-footer-bg text-white py-10 px-15">
      <div className="flex items-start gap-20">
        <div className="flex items-center gap-2.5 min-w-42 flex-shrink-0">
          <MicMark size={28} color="#fff" />
          <div className="leading-snug">
            <div className="text-base font-bold">학생의 목소리</div>
            <div className="text-base font-normal">대전대신고등학교</div>
          </div>
        </div>

        <div className="flex-shrink-0">
          <div className="text-sm font-bold tracking-widest mb-2.5">CONTACT</div>
          <div className="text-sm font-normal leading-7">
            Go Jin-yong<br />
            25_kjy1012@dshs.kr
          </div>
        </div>

        <div className="flex-shrink-0">
          <div className="text-sm font-bold tracking-widest mb-2.5">LOCATION</div>
          <div className="text-sm font-normal leading-7">
            대전광역시 서구 오량1길 98<br />
            Daejeon Korea&nbsp;&nbsp;Seo-gu, Oryang 1-gil, 98
          </div>
        </div>

        <div className="flex-shrink-0 max-w-72">
          <div className="text-sm font-bold tracking-widest mb-2.5">PRIVACY POLICY</div>
          <div className="text-xs leading-6 text-white/75">
            학생의 목소리는 학교 이메일 인증, 안건 작성, 투표 및 알림 제공에 필요한 최소한의 정보만 수집하며,
            수집된 정보는 서비스 운영과 학교 의견 전달 목적 외에는 사용하지 않습니다.
          </div>
        </div>

        <div className="ml-auto flex flex-col items-end justify-between self-stretch text-sm">
          <div />
          <div className="flex flex-col items-end gap-0.5">
            <span>site made by <strong className="font-bold">Quackk08</strong></span>
            <span>© 2026 <strong className="font-bold">ACT.</strong> All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
