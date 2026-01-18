import { useState, useEffect, useRef, useMemo } from "react"
import {
  View,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Linking,
  Platform,
  ActivityIndicator,
} from "react-native"
import { useNavigation, NavigationProp } from "@react-navigation/native"
import { useTheme } from "../contexts/ThemeContext"

/* ---------------- Types ---------------- */

type RootStackParamList = {
  NovelOverview: { novelId: string }
  [key: string]: any
}

interface BannerSlide {
  id: string
  image: string | number
  novelId?: string
  externalLink?: string
  title?: string
  alt?: string
}

interface HeroBannerProps {
  slides: BannerSlide[]
  autoSlideInterval?: number
}

/* ---------------- Constants ---------------- */

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const DESKTOP_BREAKPOINT = 768
const MOBILE_SLIDE_WIDTH = SCREEN_WIDTH * 0.92
const MOBILE_SLIDE_GAP = 10
const SLIDE_SIZE = MOBILE_SLIDE_WIDTH + MOBILE_SLIDE_GAP

/* ---------------- Component ---------------- */

const HeroBanner = ({ slides, autoSlideInterval = 4000 }: HeroBannerProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>()
  const { colors } = useTheme()

  const desktopScrollRef = useRef<ScrollView>(null)
  const mobileScrollRef = useRef<ScrollView>(null)

  const [isDesktop, setIsDesktop] = useState(SCREEN_WIDTH >= DESKTOP_BREAKPOINT)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})

  const isManualScrolling = useRef(false)
  const resumeAutoScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  /* -------- Infinite Slides (3×) -------- */

  const infiniteSlides = useMemo(
    () => [...slides, ...slides, ...slides],
    [slides]
  )

  /* -------- Banner Click -------- */

  const handleMobileBannerClick = (index: number) => {
    if (!slides.length) return

    const realIndex = index % slides.length
    const slide = slides[realIndex]

    if (slide?.externalLink) {
      Linking.openURL(slide.externalLink)
    } else if (slide?.novelId) {
      navigation.navigate("NovelOverview", { novelId: slide.novelId })
    }
  }

  const handleImageLoad = (slideId: string) => {
    setLoadedImages((prev) => ({ ...prev, [slideId]: true }))
  }

  /* -------- Auto Scroll -------- */

  useEffect(() => {
    if (slides.length <= 1 || isDesktop) return

    const interval = setInterval(() => {
      if (!isManualScrolling.current) {
        setCurrentIndex((prev) => prev + 1)
      }
    }, autoSlideInterval)

    return () => clearInterval(interval)
  }, [slides.length, autoSlideInterval, isDesktop])

  /* -------- Infinite Loop Logic -------- */

  useEffect(() => {
    if (isDesktop || !mobileScrollRef.current || !slides.length) return

    // Left boundary
    if (currentIndex < slides.length) {
      const corrected = currentIndex + slides.length
      mobileScrollRef.current.scrollTo({
        x: corrected * SLIDE_SIZE,
        animated: false,
      })
      setCurrentIndex(corrected)
      return
    }

    // Right boundary
    if (currentIndex >= slides.length * 2) {
      const corrected = currentIndex - slides.length
      mobileScrollRef.current.scrollTo({
        x: corrected * SLIDE_SIZE,
        animated: false,
      })
      setCurrentIndex(corrected)
      return
    }

    // Normal movement
    mobileScrollRef.current.scrollTo({
      x: currentIndex * SLIDE_SIZE,
      animated: true,
    })
  }, [currentIndex, isDesktop, slides.length])

  /* -------- Initial Position -------- */

  useEffect(() => {
    if (!isDesktop && mobileScrollRef.current && slides.length) {
      const startIndex = slides.length
      setCurrentIndex(startIndex)
      mobileScrollRef.current.scrollTo({
        x: startIndex * SLIDE_SIZE,
        animated: false,
      })
    }
  }, [isDesktop, slides.length])

  /* -------- Screen Resize -------- */

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setIsDesktop(window.width >= DESKTOP_BREAKPOINT)
    })
    return () => subscription?.remove()
  }, [])

  if (!slides.length) return null

  /* ---------------- Render ---------------- */

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
      {/* -------- Desktop -------- */}
      {isDesktop && (
        <View style={[styles.desktopContainer, { backgroundColor: colors.backgroundSecondary }]}>
          <ScrollView
            ref={desktopScrollRef}
            horizontal
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={styles.desktopScroll}
          >
            {slides.map((slide, index) => (
              <View
                key={`${slide.id}-${index}`}
                style={[styles.desktopSlide, { width: SCREEN_WIDTH }]}
              >
                <TouchableOpacity
                  onPress={() => handleMobileBannerClick(index)}
                  style={styles.slideButton}
                  activeOpacity={0.9}
                >
                  {!loadedImages[slide.id] && (
                    <View style={[styles.loadingPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  )}
                  <Image
                    source={
                      typeof slide.image === "string"
                        ? { uri: slide.image }
                        : slide.image
                    }
                    style={[styles.image, !loadedImages[slide.id] && styles.hiddenImage]}
                    resizeMode="cover"
                    onLoad={() => handleImageLoad(slide.id)}
                  />
                  <View style={styles.overlay} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* -------- Mobile / Tablet -------- */}
      {!isDesktop && (
        <View style={styles.mobileContainer}>
          <ScrollView
            ref={mobileScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SLIDE_SIZE}
            decelerationRate="fast"
            contentContainerStyle={styles.mobileScrollContent}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => {
              isManualScrolling.current = true
            }}
            onMomentumScrollEnd={(event) => {
              const newIndex = Math.round(
                event.nativeEvent.contentOffset.x / SLIDE_SIZE
              )
              setCurrentIndex(newIndex)

              if (resumeAutoScrollTimeout.current) {
                clearTimeout(resumeAutoScrollTimeout.current)
              }

              resumeAutoScrollTimeout.current = setTimeout(() => {
                isManualScrolling.current = false
              }, 3000)
            }}
          >
            {infiniteSlides.map((slide, index) => (
              <TouchableOpacity
                key={`${slide.id}-${index}`}
                style={styles.mobileSlide}
                onPress={() => handleMobileBannerClick(index)}
                activeOpacity={0.9}
              >
                <View style={[styles.mobileSlideInner, { backgroundColor: colors.backgroundSecondary }]}>
                  {!loadedImages[slide.id] && (
                    <View style={[styles.loadingPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  )}
                  <Image
                    source={
                      typeof slide.image === "string"
                        ? { uri: slide.image }
                        : slide.image
                    }
                    style={[styles.image, !loadedImages[slide.id] && styles.hiddenImage]}
                    resizeMode="cover"
                    onLoad={() => handleImageLoad(slide.id)}
                  />
                  <View style={styles.overlay} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

export default HeroBanner

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 1200,
    height: Platform.select({
      web: 400,
      default: 200,
    }),
    marginTop: 10,
    alignSelf: "center",
    position: "relative",
  },
  desktopContainer: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: 8,
  },
  desktopScroll: {
    width: "100%",
    height: "100%",
  },
  desktopSlide: {
    height: "100%",
  },
  slideButton: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  mobileContainer: {
    width: "100%",
    height: "100%",
  },
  mobileScroll: {
    width: "100%",
    height: "100%",
  },
  mobileScrollContent: {
    paddingHorizontal: (SCREEN_WIDTH - MOBILE_SLIDE_WIDTH) / 2,
    gap: MOBILE_SLIDE_GAP,
  },
  mobileSlide: {
    width: MOBILE_SLIDE_WIDTH,
    height: 200,
  },
  mobileSlideInner: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  hiddenImage: {
    opacity: 0,
  },
  loadingPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0)",
  },
})
