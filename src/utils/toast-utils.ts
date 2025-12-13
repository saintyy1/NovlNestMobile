// import type { ToastProps } from "../components/toast-notification"

// export const showToast = (props: ToastProps) => {
//   // Create and dispatch a custom event
//   const event = new CustomEvent("addToast", {
//     detail: props,
//   })

//   window.dispatchEvent(event)
// }

// export const showNewChapterToast = (novelTitle: string, chapterNumber: number, customMessage?: string) => {
//   const message = customMessage || `New chapter added to "${novelTitle}": Chapter ${chapterNumber}`

//   showToast({
//     message,
//     type: "info",
//     duration: 6000, // Show for 6 seconds for chapter notifications
//   })
// }

// export const showSuccessToast = (message: string) => {
//   showToast({
//     message,
//     type: "success",
//     duration: 4000,
//   })
// }

// export const showErrorToast = (message: string) => {
//   showToast({
//     message,
//     type: "error",
//     duration: 5000,
//   })
// }
