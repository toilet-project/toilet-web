const kakaoJavascriptKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY

if (!kakaoJavascriptKey) {
  throw new Error('VITE_KAKAO_JAVASCRIPT_KEY 환경변수가 설정되지 않았습니다.')
}

export { kakaoJavascriptKey }
