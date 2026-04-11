"use client";

import type { ReactNode } from "react";
import { useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { HashNavigation, A11y } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";

// @ts-expect-error -- swiper/css has no type declarations (TS2882 in TS5.8+)
import "swiper/css";

const SLIDE_HASHES = ["info", "itinerary", "messages", "photos", "settle"] as const;

export interface MobileTripSwiperRef {
  slideTo: (index: number) => void;
}

interface MobileTripSwiperProps {
  onSlideChange: (index: number) => void;
  onProgress: (progress: number) => void;
  allowTouchMove?: boolean;
  children: [ReactNode, ReactNode, ReactNode, ReactNode, ReactNode];
}

export const MobileTripSwiper = forwardRef<
  MobileTripSwiperRef,
  MobileTripSwiperProps
>(function MobileTripSwiper({ onSlideChange, onProgress, allowTouchMove = true, children }, ref) {
  const swiperRef = useRef<SwiperType | null>(null);

  useImperativeHandle(ref, () => ({
    slideTo: (index: number) => {
      swiperRef.current?.slideTo(index);
    },
  }));

  const handleSwiper = useCallback((swiper: SwiperType) => {
    swiperRef.current = swiper;
  }, []);

  // Dynamically enable/disable touch swiping (e.g. when a dialog is open)
  useEffect(() => {
    if (swiperRef.current) {
      swiperRef.current.allowTouchMove = allowTouchMove;
    }
  }, [allowTouchMove]);

  const handleSlideChange = useCallback(
    (swiper: SwiperType) => {
      onSlideChange(swiper.activeIndex);
    },
    [onSlideChange],
  );

  const handleProgress = useCallback(
    (_swiper: SwiperType, progress: number) => {
      onProgress(progress);
    },
    [onProgress],
  );

  return (
    <Swiper
      modules={[HashNavigation, A11y]}
      slidesPerView={1}
      spaceBetween={0}
      speed={300}
      allowTouchMove={allowTouchMove}
      hashNavigation={{ replaceState: true, watchState: true }}
      onSwiper={handleSwiper}
      onSlideChange={handleSlideChange}
      onProgress={handleProgress}
      className="h-full overflow-hidden"
    >
      {SLIDE_HASHES.map((hash, index) => (
        <SwiperSlide
          key={hash}
          data-hash={hash}
          className="overflow-y-auto overscroll-contain"
        >
          {children[index]}
        </SwiperSlide>
      ))}
    </Swiper>
  );
});
