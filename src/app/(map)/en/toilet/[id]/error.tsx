'use client'
import { MapRouteFailure } from '../../../../../components/MapRouteFailure'
export default function EnglishToiletError({ reset }: { reset: () => void }) { return <MapRouteFailure retry={reset} /> }
