import {render} from "@testing-library/react-native"

import AccountScreensLayout from "@/app/auth/_layout"

// Sightline: the layout that wraps every screen under /auth sends the app back to the boot route instead of showing
// one, whatever link or navigation the router resolved to get there. See docs/sightline/spec-phase2.md.

const mockRedirect = jest.fn()
const mockSlot = jest.fn()

jest.mock("expo-router", () => ({
  Redirect: (props: {href: string}) => {
    mockRedirect(props.href)
    return null
  },
  Slot: () => {
    mockSlot()
    return null
  },
}))

beforeEach(() => jest.clearAllMocks())

it("leaves for the boot route and renders none of the account screens", () => {
  render(<AccountScreensLayout />)
  expect(mockRedirect).toHaveBeenCalledWith("/")
  expect(mockSlot).not.toHaveBeenCalled()
})

it("renders the screens in a build that has accounts (upstream's deployment)", () => {
  jest.isolateModules(() => {
    jest.doMock("@/services/deployment/officialManifest", () => jest.requireActual("@/test-utils/mentraCloudManifest"))
    const Layout = require("@/app/auth/_layout").default
    render(<Layout />)
  })
  expect(mockSlot).toHaveBeenCalledTimes(1)
  expect(mockRedirect).not.toHaveBeenCalled()
})
