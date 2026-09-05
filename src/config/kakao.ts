const kakaoJavascriptKey = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY

if (!kakaoJavascriptKey) {
  throw new Error('NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY 환경변수가 설정되지 않았습니다.')
}

export { kakaoJavascriptKey }
